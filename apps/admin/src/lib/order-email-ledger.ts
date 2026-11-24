/**
 * Send-exactly-once for automated order mail.
 *
 * The shipping poller re-reads every open parcel on every run. A parcel sitting
 * at a service point for two days would, without a record of what has already
 * gone out, mail the customer on every single tick. No customer email in this
 * repo had any sent-record before this — `orderRefunds.emailSentAt` is the
 * closest thing and nothing reads it to block a resend.
 *
 * The guarantee is the UNIQUE (order_id, kind) index, not this code. The flow
 * is claim-then-send: insert the row with `onConflictDoNothing`, and only send
 * if the insert actually won. Two processes racing the same mail — the
 * in-process cron and an external heartbeat both firing at :00 — both attempt
 * the insert, exactly one wins, and the loser does nothing. That is the same
 * insert-and-inspect-rowcount pattern `persistOrder` uses to stop a duplicate
 * Stripe webhook creating a second order.
 *
 * `sentAt` stays NULL until the transport confirms. A process killed mid-send
 * therefore leaves a *claim*, not a false record that the customer was told,
 * and the claim becomes re-claimable after RECLAIM_AFTER_MS so the mail is
 * retried instead of silently lost.
 */

import { db } from "@repo/database";
import { orderEmails, orders } from "@repo/database/schema";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";

/**
 * The kinds, labels and state derivation live in `order-email-state.ts` — a
 * module with no database import, so a `"use client"` page can read them
 * without pulling drizzle and `pg` into the browser bundle. Re-exported here
 * because this is the path every existing caller already imports.
 */
export {
  ORDER_EMAIL_KINDS,
  ORDER_EMAIL_LABELS,
  ORDER_EMAIL_STATE_META,
  ORDER_EMAIL_ORIGIN_LABELS,
  RECLAIM_AFTER_MS,
  orderEmailLabel,
  orderEmailOrigin,
  orderEmailState,
  type OrderEmailKind,
  type OrderEmailState,
  type OrderEmailStateInput,
} from "./order-email-state";

import {
  RECLAIM_AFTER_MS,
  orderEmailState,
  type OrderEmailKind,
  type OrderEmailStateInput,
} from "./order-email-state";

/** True when this row represents a mail that actually reached the transport. */
export function orderEmailWasSent(row: OrderEmailStateInput): boolean {
  return orderEmailState(row) === "sent";
}

export type ClaimResult =
  | { claimed: true; id: number }
  /** Someone else owns it, or it has already been sent. Do nothing. */
  | { claimed: false; reason: "already_sent" | "claimed_elsewhere" };

/**
 * Takes ownership of (orderId, kind), or reports that someone else has it.
 *
 * Never throws for the ordinary "already handled" case — that is the expected
 * outcome on most ticks and is not an error.
 */
export async function claimOrderEmail(
  orderId: number,
  kind: OrderEmailKind,
  meta?: Record<string, unknown>,
): Promise<ClaimResult> {
  const now = new Date();

  const inserted = await db
    .insert(orderEmails)
    .values({ orderId, kind, claimedAt: now, meta: meta ?? null })
    .onConflictDoNothing({ target: [orderEmails.orderId, orderEmails.kind] })
    .returning({ id: orderEmails.id });

  const won = inserted[0];
  if (won) return { claimed: true, id: won.id };

  /**
   * The insert lost, so a row exists. It is reclaimable only if it was never
   * confirmed sent AND the claim has gone stale. The `isNull(sentAt)` in the
   * WHERE is what makes this safe to race: two runners both reclaiming the
   * same abandoned row still produce one UPDATE that matches, because the
   * second sees the row only if the first has not yet set `sentAt`.
   */
  const staleBefore = new Date(now.getTime() - RECLAIM_AFTER_MS);
  const reclaimed = await db
    .update(orderEmails)
    .set({ claimedAt: now, meta: meta ?? null })
    .where(
      and(
        eq(orderEmails.orderId, orderId),
        eq(orderEmails.kind, kind),
        isNull(orderEmails.sentAt),
        lt(orderEmails.claimedAt, staleBefore),
      ),
    )
    .returning({ id: orderEmails.id });

  const retry = reclaimed[0];
  if (retry) return { claimed: true, id: retry.id };

  const [existing] = await db
    .select({ sentAt: orderEmails.sentAt })
    .from(orderEmails)
    .where(and(eq(orderEmails.orderId, orderId), eq(orderEmails.kind, kind)))
    .limit(1);

  return {
    claimed: false,
    reason: existing?.sentAt ? "already_sent" : "claimed_elsewhere",
  };
}

/** Confirms the transport accepted the message. Only now is it truly "sent". */
export async function markOrderEmailSent(
  id: number,
  recipient?: string | null,
): Promise<void> {
  await db
    .update(orderEmails)
    .set({ sentAt: new Date(), recipient: recipient ?? null, error: null })
    .where(eq(orderEmails.id, id));
}

/**
 * Records a failure, leaving `sentAt` NULL so the claim ages out and retries.
 *
 * The claim timestamp is deliberately NOT reset: the retry clock should run
 * from when we first tried, not from when we last failed, or a mail failing
 * fast in a loop would never become reclaimable.
 */
export async function markOrderEmailFailed(id: number, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(orderEmails)
    .set({ error: message.slice(0, 2000) })
    .where(eq(orderEmails.id, id));
}

/** Releases a claim outright — used by dry-run, which must leave no trace. */
export async function releaseOrderEmail(id: number): Promise<void> {
  await db.delete(orderEmails).where(eq(orderEmails.id, id));
}

export type OrderEmailRecord = {
  id: number;
  kind: string;
  claimedAt: Date;
  sentAt: Date | null;
  recipient: string | null;
  error: string | null;
  /**
   * Carried so the caller can derive a state. Without it a superseded row —
   * `sentAt` set, nothing emailed — is indistinguishable from a real send,
   * which is exactly what the order page used to get wrong.
   */
  meta: Record<string, unknown> | null;
};

/** Everything sent (or attempted) for one order — powers the admin "Utskick" list. */
export async function listOrderEmails(orderId: number): Promise<OrderEmailRecord[]> {
  const rows = await db
    .select({
      id: orderEmails.id,
      kind: orderEmails.kind,
      claimedAt: orderEmails.claimedAt,
      sentAt: orderEmails.sentAt,
      recipient: orderEmails.recipient,
      error: orderEmails.error,
      meta: orderEmails.meta,
    })
    .from(orderEmails)
    .where(eq(orderEmails.orderId, orderId));

  return rows.map((r) => ({
    ...r,
    meta: (r.meta as Record<string, unknown> | null) ?? null,
  }));
}

/**
 * One row per recorded mail across every order, newest first.
 *
 * Powers the E-postlogg page. Separate from `listOrderEmails` rather than a
 * parameterised version of it because the two need different columns: this one
 * must return `meta` (to tell a real send from a superseded one) and the joined
 * order so a row can name its customer, where the per-order list already has
 * both from its page.
 *
 * Ordered by when the mail happened — `sentAt` when there is one, the claim
 * otherwise — so a failed or in-flight row sorts among the sends rather than
 * sinking to the bottom on a null.
 *
 * `limit` rather than offset pagination, matching `api/refunds/route.ts`: the
 * table grows about eight rows per order, and the page filters client-side.
 */
export type OrderEmailLogRow = {
  id: number;
  orderId: number;
  orderNumber: string | null;
  customerName: string | null;
  customerEmail: string | null;
  kind: string;
  claimedAt: Date;
  sentAt: Date | null;
  recipient: string | null;
  error: string | null;
  meta: Record<string, unknown> | null;
};

export async function listAllOrderEmails(limit = 500): Promise<OrderEmailLogRow[]> {
  const rows = await db
    .select({
      id: orderEmails.id,
      orderId: orderEmails.orderId,
      orderNumber: orders.orderNumber,
      firstName: orders.firstName,
      lastName: orders.lastName,
      customerEmail: orders.email,
      kind: orderEmails.kind,
      claimedAt: orderEmails.claimedAt,
      sentAt: orderEmails.sentAt,
      recipient: orderEmails.recipient,
      error: orderEmails.error,
      meta: orderEmails.meta,
    })
    .from(orderEmails)
    .leftJoin(orders, eq(orderEmails.orderId, orders.id))
    .orderBy(desc(sql`COALESCE(${orderEmails.sentAt}, ${orderEmails.claimedAt})`))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    orderNumber: r.orderNumber ?? null,
    customerName: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || null,
    customerEmail: r.customerEmail ?? null,
    kind: r.kind,
    claimedAt: r.claimedAt,
    sentAt: r.sentAt,
    recipient: r.recipient,
    error: r.error,
    meta: (r.meta as Record<string, unknown> | null) ?? null,
  }));
}

/**
 * True when this mail has already gone out, or is in flight elsewhere.
 *
 * For callers that want to check without claiming — the manual "skicka
 * fraktmail" button uses it to warn staff before they re-send by hand.
 */
export async function hasOrderEmail(orderId: number, kind: OrderEmailKind): Promise<boolean> {
  const [row] = await db
    .select({ sentAt: orderEmails.sentAt, claimedAt: orderEmails.claimedAt })
    .from(orderEmails)
    .where(and(eq(orderEmails.orderId, orderId), eq(orderEmails.kind, kind)))
    .limit(1);
  if (!row) return false;
  // Sent outright, or claimed recently enough that a send is probably in flight.
  if (row.sentAt) return true;
  return row.claimedAt.getTime() > Date.now() - RECLAIM_AFTER_MS;
}
