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
import { orderEmails } from "@repo/database/schema";
import { and, eq, isNull, lt } from "drizzle-orm";

/**
 * Every automated mail this system can send.
 *
 * Adding one needs no migration — `kind` is free text in the table — but it
 * must be listed here so the dry-run report and the admin "Utskick" list can
 * name it.
 */
export const ORDER_EMAIL_KINDS = [
  "shipment_dispatched",
  "ready_for_pickup",
  "pickup_reminder_1",
  "pickup_reminder_2",
  "order_delivered",
  "core_return_reminder",
  "core_return_overdue",
] as const;

export type OrderEmailKind = (typeof ORDER_EMAIL_KINDS)[number];

/**
 * How long a claim may sit unconfirmed before another run may take it.
 *
 * Long enough that a slow SMTP handshake is never treated as a crash; short
 * enough that a genuine crash retries within one poll cycle.
 */
const RECLAIM_AFTER_MS = 15 * 60 * 1000;

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
  kind: string;
  claimedAt: Date;
  sentAt: Date | null;
  recipient: string | null;
  error: string | null;
};

/** Everything sent (or attempted) for one order — powers the admin "Utskick" list. */
export async function listOrderEmails(orderId: number): Promise<OrderEmailRecord[]> {
  return db
    .select({
      kind: orderEmails.kind,
      claimedAt: orderEmails.claimedAt,
      sentAt: orderEmails.sentAt,
      recipient: orderEmails.recipient,
      error: orderEmails.error,
    })
    .from(orderEmails)
    .where(eq(orderEmails.orderId, orderId));
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
