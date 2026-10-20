/**
 * Stripe refunds for an order.
 *
 * Two jobs, deliberately separated: quote what can still be refunded, and issue
 * a refund. The quote is read live from Stripe every time — never from our own
 * rows — because a refund issued from the Stripe dashboard never reaches us
 * (apps/client's webhook handles only payment_intent.* and 200-acks the rest).
 * Trusting local totals would let us quote an amount Stripe then rejects, or
 * worse, over-refund.
 *
 * Our `order_refunds` rows exist to reserve, to audit and to show history.
 */

import type Stripe from "stripe";
import { db, orders, orderRefunds } from "@repo/database";
import { and, eq, sql } from "drizzle-orm";
import { normalizeCurrency, toMinorUnits } from "@repo/currency";
import { stripeClient, STRIPE_NOT_CONFIGURED } from "./stripe-client.js";

/** Which payment slot of the order a charge came from. */
export type ChargeKind = "full" | "deposit" | "balance";

export type RefundableCharge = {
  kind: ChargeKind;
  /** Swedish, shown verbatim in the admin. */
  label: string;
  currency: string;
  /** Major units. */
  amount: number;
  amountRefunded: number;
  /** Already reserved by a pending row of ours, not yet visible in Stripe's figure. */
  pendingLocal: number;
  refundable: number;
  last4: string | null;
  /** Non-null when nothing can be refunded and the admin deserves to know why. */
  blockedReason: string | null;
};

export type RefundRow = {
  id: number;
  chargeKind: string;
  amount: number;
  currency: string;
  status: string;
  note: string | null;
  performedBy: string | null;
  stripeRefundId: string | null;
  stripeFailureReason: string | null;
  emailSentAt: string | null;
  createdAt: string;
};

export type RefundQuote = {
  currency: string;
  charges: RefundableCharge[];
  refunds: RefundRow[];
};

export class RefundError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RefundError";
  }
}

type OrderRow = typeof orders.$inferSelect;

/**
 * The PaymentIntent behind each slot of the order.
 *
 * A deposit order charges twice, so "refund this order" is ambiguous until the
 * admin says which charge. A full-payment order has one, labelled plainly.
 */
function chargeSlots(order: OrderRow): { kind: ChargeKind; label: string; paymentIntentId: string }[] {
  const slots: { kind: ChargeKind; label: string; paymentIntentId: string }[] = [];
  const deposit = (order.stripePaymentId ?? "").trim();
  const balance = (order.stripeBalancePaymentId ?? "").trim();
  const isDepositOrder = order.depositAmount != null;

  if (deposit.startsWith("pi_")) {
    slots.push({
      kind: isDepositOrder ? "deposit" : "full",
      label: isDepositOrder ? "Deposition" : "Betalning",
      paymentIntentId: deposit,
    });
  }
  if (balance.startsWith("pi_")) {
    slots.push({ kind: "balance", label: "Restbetalning", paymentIntentId: balance });
  }
  return slots;
}

function asCharge(pi: Stripe.PaymentIntent): Stripe.Charge | null {
  const c = pi.latest_charge;
  return c && typeof c === "object" ? (c as Stripe.Charge) : null;
}

/** Major units from Stripe's minor units. All four charge currencies are 2-decimal to Stripe. */
function fromMinorUnits(minor: number): number {
  return Math.round(minor) / 100;
}

/** Sum of our own rows that have reserved money but not yet shown up in Stripe's figure. */
async function pendingReservedFor(orderId: number, paymentIntentId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${orderRefunds.amount}), 0)` })
    .from(orderRefunds)
    .where(
      and(
        eq(orderRefunds.orderId, orderId),
        eq(orderRefunds.stripePaymentIntentId, paymentIntentId),
        eq(orderRefunds.status, "pending"),
      ),
    );
  return Number(row?.total ?? 0);
}

function toRefundRow(r: typeof orderRefunds.$inferSelect): RefundRow {
  return {
    id: r.id,
    chargeKind: r.chargeKind,
    amount: Number(r.amount),
    currency: r.currency,
    status: r.status,
    note: r.note,
    performedBy: r.performedBy,
    stripeRefundId: r.stripeRefundId,
    stripeFailureReason: r.stripeFailureReason,
    emailSentAt: r.emailSentAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listRefunds(orderId: number): Promise<RefundRow[]> {
  const rows = await db
    .select()
    .from(orderRefunds)
    .where(eq(orderRefunds.orderId, orderId))
    .orderBy(sql`${orderRefunds.createdAt} DESC`);
  return rows.map(toRefundRow);
}

async function loadOrder(orderId: number): Promise<OrderRow> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new RefundError("Order hittades inte", 404);
  return order;
}

/**
 * What each charge on this order can still give back, straight from Stripe.
 */
export async function quoteRefundable(orderId: number): Promise<RefundQuote> {
  if (!stripeClient) throw new RefundError(STRIPE_NOT_CONFIGURED, 503);

  const order = await loadOrder(orderId);
  const orderCurrency = normalizeCurrency(order.currency);
  const charges: RefundableCharge[] = [];

  for (const slot of chargeSlots(order)) {
    let pi: Stripe.PaymentIntent;
    try {
      pi = await stripeClient.paymentIntents.retrieve(slot.paymentIntentId, {
        expand: ["latest_charge"],
      });
    } catch (e) {
      charges.push({
        kind: slot.kind,
        label: slot.label,
        currency: orderCurrency,
        amount: 0,
        amountRefunded: 0,
        pendingLocal: 0,
        refundable: 0,
        last4: null,
        blockedReason:
          e instanceof Error ? `Kunde inte läsa betalningen: ${e.message}` : "Kunde inte läsa betalningen",
      });
      continue;
    }

    const charge = asCharge(pi);
    const base = {
      kind: slot.kind,
      label: slot.label,
      currency: orderCurrency,
      amount: 0,
      amountRefunded: 0,
      pendingLocal: 0,
      refundable: 0,
      last4: charge?.payment_method_details?.card?.last4 ?? null,
    };

    if (pi.status !== "succeeded") {
      charges.push({ ...base, blockedReason: `Betalningen är inte genomförd (${pi.status})` });
      continue;
    }
    if (!charge) {
      charges.push({ ...base, blockedReason: "Betalningen saknar debitering hos Stripe" });
      continue;
    }

    // Unlike units must never satisfy each other: 2 677 NOK is not 2 677 SEK.
    // The same assertion verifySucceededBalancePaymentIntent makes on the way in.
    if (String(charge.currency || "").toLowerCase() !== orderCurrency.toLowerCase()) {
      charges.push({
        ...base,
        blockedReason: `Valutan stämmer inte (ordern är ${orderCurrency}, betalningen ${String(charge.currency).toUpperCase()})`,
      });
      continue;
    }

    const amount = fromMinorUnits(charge.amount);
    const amountRefunded = fromMinorUnits(charge.amount_refunded);
    const pendingLocal = await pendingReservedFor(orderId, slot.paymentIntentId);
    const refundable = Math.max(0, amount - amountRefunded - pendingLocal);

    charges.push({
      ...base,
      amount,
      amountRefunded,
      pendingLocal,
      refundable,
      blockedReason: refundable > 0 ? null : "Inget belopp kvar att återbetala",
    });
  }

  return { currency: orderCurrency, charges, refunds: await listRefunds(orderId) };
}

export type IssueRefundInput = {
  orderId: number;
  kind: ChargeKind;
  /** Major units, in the charge currency. */
  amount: number;
  /** One UUID per confirm-dialog open. The whole double-submit defence rests on this. */
  requestId: string;
  note?: string | null;
  performedBy?: string | null;
};

export type IssueRefundResult = {
  refund: RefundRow;
  /** True when this call found an existing reservation and did not charge Stripe again. */
  deduplicated: boolean;
  orderStatus: string;
  /** Null unless the whole order is now refunded. */
  fullyRefunded: boolean;
};

/**
 * Issue one refund.
 *
 * The order of operations is the point. We reserve in Postgres before calling
 * Stripe, so a retry finds the reservation; we pass Stripe its own idempotency
 * key, so a retry that races past the reservation still gets a replay rather
 * than a second refund; and we never hold a row lock across the network call.
 */
export async function issueRefund(input: IssueRefundInput): Promise<IssueRefundResult> {
  if (!stripeClient) throw new RefundError(STRIPE_NOT_CONFIGURED, 503);

  const { orderId, kind, requestId } = input;
  if (!requestId || typeof requestId !== "string" || requestId.length > 100) {
    throw new RefundError("requestId saknas", 400);
  }

  const order = await loadOrder(orderId);
  const orderCurrency = normalizeCurrency(order.currency);
  const slot = chargeSlots(order).find((s) => s.kind === kind);
  if (!slot) {
    throw new RefundError(`Ordern har ingen betalning av typen "${kind}"`, 400);
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RefundError("Beloppet måste vara större än noll", 400);
  }
  const amountMinor = toMinorUnits(amount);
  if (amountMinor < 1) {
    throw new RefundError("Beloppet är för litet", 400);
  }

  // Re-read from Stripe. The browser's number is a hint; this is the authority.
  const pi = await stripeClient.paymentIntents.retrieve(slot.paymentIntentId, {
    expand: ["latest_charge"],
  });
  const charge = asCharge(pi);
  if (pi.status !== "succeeded" || !charge) {
    throw new RefundError("Betalningen kan inte återbetalas", 400);
  }
  if (String(charge.currency || "").toLowerCase() !== orderCurrency.toLowerCase()) {
    throw new RefundError("Valutan stämmer inte mellan order och betalning", 409);
  }

  const idempotencyKey = `refund:${orderId}:${charge.id}:${amountMinor}:${requestId}`.slice(0, 255);

  // --- Reserve, in a transaction, with the order row locked. -----------------
  // Two admins each refunding "everything left" at the same moment serialize
  // here, and the second one's recompute sees the first one's pending row.
  const reservation = await db.transaction(async (tx) => {
    await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).for("update");

    const [pendingRow] = await tx
      .select({ total: sql<string>`COALESCE(SUM(${orderRefunds.amount}), 0)` })
      .from(orderRefunds)
      .where(
        and(
          eq(orderRefunds.orderId, orderId),
          eq(orderRefunds.stripePaymentIntentId, slot.paymentIntentId),
          eq(orderRefunds.status, "pending"),
        ),
      );
    const pendingLocal = Number(pendingRow?.total ?? 0);
    const refundable =
      fromMinorUnits(charge.amount) - fromMinorUnits(charge.amount_refunded) - pendingLocal;

    const [existing] = await tx
      .select()
      .from(orderRefunds)
      .where(eq(orderRefunds.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing) return { row: existing, fresh: false, refundable };

    if (amount > refundable + 1e-9) {
      throw new RefundError(
        `Beloppet överstiger vad som kan återbetalas (max ${refundable.toFixed(2)} ${orderCurrency})`,
        400,
      );
    }

    const inserted = await tx
      .insert(orderRefunds)
      .values({
        orderId,
        stripePaymentIntentId: slot.paymentIntentId,
        stripeChargeId: charge.id,
        chargeKind: kind,
        amount: amount.toFixed(2),
        currency: orderCurrency,
        status: "pending",
        note: input.note?.trim() || null,
        idempotencyKey,
        performedBy: input.performedBy ?? null,
      })
      .onConflictDoNothing({ target: orderRefunds.idempotencyKey })
      .returning();

    if (inserted[0]) return { row: inserted[0], fresh: true, refundable };

    // Lost the race on the unique index — the winner's row is the answer.
    const [raced] = await tx
      .select()
      .from(orderRefunds)
      .where(eq(orderRefunds.idempotencyKey, idempotencyKey))
      .limit(1);
    if (!raced) throw new RefundError("Kunde inte reservera återbetalningen", 500);
    return { row: raced, fresh: false, refundable };
  });

  // A reservation that already resolved is simply replayed — no second refund.
  if (reservation.row.status !== "pending") {
    return {
      refund: toRefundRow(reservation.row),
      deduplicated: true,
      orderStatus: order.status,
      fullyRefunded: order.status === "refunded",
    };
  }

  // --- Charge Stripe, outside the transaction. -------------------------------
  let refund: Stripe.Refund;
  try {
    refund = await stripeClient.refunds.create(
      {
        charge: charge.id,
        amount: amountMinor,
        reason: "requested_by_customer",
        metadata: { orderId: String(orderId), orderNumber: order.orderNumber, chargeKind: kind },
      },
      { idempotencyKey },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe avvisade återbetalningen";
    await db
      .update(orderRefunds)
      .set({ status: "failed", stripeFailureReason: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(orderRefunds.id, reservation.row.id));
    throw new RefundError(message, 502);
  }

  const succeeded = refund.status === "succeeded" || refund.status === "pending";
  const [saved] = await db
    .update(orderRefunds)
    .set({
      stripeRefundId: refund.id,
      status: succeeded ? "succeeded" : "failed",
      stripeFailureReason: succeeded ? null : (refund.failure_reason ?? "unknown"),
      updatedAt: new Date(),
    })
    .where(eq(orderRefunds.id, reservation.row.id))
    .returning();

  // --- Status, derived from what Stripe now says is left on every charge. ----
  const after = await quoteRefundable(orderId);
  const anyRefunded = after.charges.some((c) => c.amountRefunded > 0);
  const nothingLeft = after.charges.every((c) => c.refundable <= 0);
  const fullyRefunded = anyRefunded && nothingLeft;
  const nextStatus = fullyRefunded
    ? "refunded"
    : anyRefunded
      ? "partially_refunded"
      : order.status;

  if (nextStatus !== order.status) {
    await db.update(orders).set({ status: nextStatus }).where(eq(orders.id, orderId));
  }

  return {
    refund: toRefundRow(saved ?? reservation.row),
    deduplicated: false,
    orderStatus: nextStatus,
    fullyRefunded,
  };
}

/** Stamp the row once the customer mail is away, so a resend is traceable. */
export async function markRefundEmailSent(refundId: number): Promise<void> {
  await db
    .update(orderRefunds)
    .set({ emailSentAt: new Date(), updatedAt: new Date() })
    .where(eq(orderRefunds.id, refundId));
}
