/**
 * Polls PostNord for every open parcel, moves the order's status on PostNord's
 * own signal, and fires the customer emails each transition is due.
 *
 * ## What this replaces, and why
 *
 * The previous implementation decided a parcel had been delivered like this:
 *
 *     JSON.stringify(data).toLowerCase().includes("utlämning")   // + 6 more
 *
 * It polls with `locale=sv`, so the payload is Swedish, and PostNord's wording
 * for a parcel arriving at the pickup point is "Försändelsen har kommit till
 * mottagarens **utlämningsställe**" — which contains "utlämning". Every parcel
 * was therefore flipped to `delivered` on arrival at the service point, days
 * before the customer collected it. `"received"` had the same defect against
 * the early "mottagen" events, which fire when the parcel leaves US.
 *
 * It also could not reach most orders at all. It selected `status = 'shipped'`,
 * but booking deliberately leaves an order at `confirmed` — so a booked parcel
 * was never polled until a human manually changed its status. The automation
 * could not see the orders it existed to watch.
 *
 * Both are gone: `@repo/shipping` reads PostNord's documented `item.status`
 * enum, and selection is driven by "has a tracking id and is not finished".
 */

import { db } from "@repo/database";
import { orders } from "@repo/database/schema";
import { and, eq, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import {
  parseTrackingResponse,
  mapToOrderStatus,
  isAwaitingPickup,
  isException,
  isTerminal,
  type PostNordItemStatus,
} from "@repo/shipping";
import { fetchPostNordTrackingJson } from "@/lib/postnord-track-shipment";
import {
  claimOrderEmail,
  markOrderEmailSent,
  markOrderEmailFailed,
  releaseOrderEmail,
  type OrderEmailKind,
} from "@/lib/order-email-ledger";
import { sendOrderNotification } from "@/lib/trigger-order-notification";

/* ------------------------------------------------------------------ *
 * Tuning
 * ------------------------------------------------------------------ */

/** Orders touched per run. The old loop had no limit and no rate limiting. */
const MAX_ORDERS_PER_RUN = 200;
/** Parallel PostNord calls. Their gateway is not generous; keep this low. */
const CONCURRENCY = 4;
/** Don't re-ask about the same parcel more often than this. */
const MIN_POLL_INTERVAL_MS = 30 * 60 * 1000;
/** After this long with no change, drop to one check a day. */
const SLOW_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const SLOW_POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Give up entirely: PostNord ages tracking data out and it will never change. */
const ABANDON_AFTER_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Days after a parcel becomes collectable to nudge the customer.
 *
 * PostNord holds a parcel for **3 days**, not 7 — they halved it on
 * 1 October 2026 (the recipient can extend back to 7 in PostNord's app).
 * Reminders at day 5 and 9, which an earlier draft of this used, would arrive
 * after the parcel had already been returned to us at our cost — the exact
 * outcome the reminders exist to prevent. Re-check this if PostNord moves it.
 */
function pickupReminderDays(): [number, number] {
  const raw = process.env.PICKUP_REMINDER_DAYS?.trim();
  if (raw) {
    const parts = raw.split(",").map((p) => Number(p.trim()));
    const a = parts[0];
    const b = parts[1];
    if (a != null && b != null && Number.isFinite(a) && Number.isFinite(b)) return [a, b];
  }
  return [1, 2];
}

/** Compute, log, change nothing, send nothing. */
function isDryRun(): boolean {
  return process.env.SHIPPING_SYNC_DRY_RUN === "true";
}

/* ------------------------------------------------------------------ *
 * Result
 * ------------------------------------------------------------------ */

export type ShippingSyncResult = {
  checked: number;
  /** Orders whose PostNord status changed this run. */
  updated: number;
  emailed: number;
  failed: number;
  /** Parcels PostNord could not tell us anything new about. */
  skipped: number;
  exceptions: Array<{ orderId: number; status: PostNordItemStatus }>;
  dryRun: boolean;
  /** Set when another run held the lock, in which case nothing was done. */
  lockedOut?: boolean;
};

/* ------------------------------------------------------------------ *
 * Candidate selection
 * ------------------------------------------------------------------ */

type Candidate = {
  id: number;
  trackingId: string | null;
  status: string;
  postNordStatus: string | null;
  postNordStatusAt: Date | null;
  postNordAvailableAt: Date | null;
  lastPolledAt: Date | null;
  createdAt: Date;
};

/**
 * Parcels worth asking about: booked, not cancelled, not finished.
 *
 * Deliberately NOT filtered on `orders.status` — that was the bug that made the
 * old job unreachable for booked orders.
 */
async function selectCandidates(): Promise<Candidate[]> {
  const rows = await db
    .select({
      id: orders.id,
      trackingId: orders.postNordTrackingId,
      status: orders.status,
      postNordStatus: orders.postNordStatus,
      postNordStatusAt: orders.postNordStatusAt,
      postNordAvailableAt: orders.postNordAvailableAt,
      lastPolledAt: orders.postNordLastPolledAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        isNotNull(orders.postNordTrackingId),
        isNull(orders.postNordBookingCancelledAt),
        or(
          isNull(orders.postNordStatus),
          notInArray(orders.postNordStatus, ["DELIVERED", "RETURNED"]),
        ),
        // Cheap pre-filter; the precise backoff is applied in JS below.
        or(isNull(orders.postNordLastPolledAt), lt(orders.postNordLastPolledAt, new Date(Date.now() - MIN_POLL_INTERVAL_MS))),
      ),
    )
    .limit(MAX_ORDERS_PER_RUN);

  const now = Date.now();
  return rows.filter((r) => {
    const tid = String(r.trackingId ?? "").trim();
    if (!tid || tid.toLowerCase() === "null") return false;

    const age = now - (r.createdAt?.getTime() ?? now);
    if (age > ABANDON_AFTER_MS) return false;

    const sinceChange = now - (r.postNordStatusAt?.getTime() ?? r.createdAt?.getTime() ?? now);
    const interval = sinceChange > SLOW_AFTER_MS ? SLOW_POLL_INTERVAL_MS : MIN_POLL_INTERVAL_MS;
    const lastPoll = r.lastPolledAt?.getTime() ?? 0;
    return now - lastPoll >= interval;
  });
}

/* ------------------------------------------------------------------ *
 * Which emails are due
 * ------------------------------------------------------------------ */

type DueEmail = { kind: OrderEmailKind; reason: string };

/**
 * Decides what to send for the status we just observed.
 *
 * `supersede` marks a mail that should never be sent now — the parcel moved
 * past it before we looked. A parcel first seen already sitting at the service
 * point should get "klar att hämta", not that plus a "nu är den på väg" for a
 * journey that is over. Superseded kinds are recorded as handled so they
 * cannot fire on a later tick.
 */
export function emailsDue(
  status: PostNordItemStatus,
  availableAt: Date | null,
  now: Date,
): { send: DueEmail[]; supersede: OrderEmailKind[] } {
  const send: DueEmail[] = [];
  const supersede: OrderEmailKind[] = [];

  if (status === "EN_ROUTE") {
    send.push({ kind: "shipment_dispatched", reason: "EN_ROUTE" });
  }

  if (isAwaitingPickup(status)) {
    // The parcel is there; a "på väg" mail now would be behind the facts.
    supersede.push("shipment_dispatched");
    send.push({ kind: "ready_for_pickup", reason: status });

    if (availableAt) {
      const [d1, d2] = pickupReminderDays();
      const daysWaiting = (now.getTime() - availableAt.getTime()) / 86_400_000;
      if (daysWaiting >= d2) send.push({ kind: "pickup_reminder_2", reason: `${d2}d uncollected` });
      else if (daysWaiting >= d1) send.push({ kind: "pickup_reminder_1", reason: `${d1}d uncollected` });
    }
  }

  if (status === "DELIVERED") {
    // Everything earlier is moot once it is in their hands.
    supersede.push("shipment_dispatched", "ready_for_pickup", "pickup_reminder_1", "pickup_reminder_2");
    send.push({ kind: "order_delivered", reason: "DELIVERED" });
  }

  if (status === "RETURNED") {
    supersede.push("pickup_reminder_1", "pickup_reminder_2");
  }

  return { send, supersede };
}

/* ------------------------------------------------------------------ *
 * One order
 * ------------------------------------------------------------------ */

type OrderOutcome = {
  changed: boolean;
  emailed: number;
  failed: number;
  skipped: boolean;
  exception?: PostNordItemStatus;
};

async function syncOne(order: Candidate, dryRun: boolean): Promise<OrderOutcome> {
  const tid = String(order.trackingId ?? "").trim();
  const now = new Date();

  const res = await fetchPostNordTrackingJson(tid, "sv");
  if (!res.ok) {
    /**
     * A failed lookup is not evidence of anything. Stamp the poll time anyway
     * so one permanently-broken id cannot be retried every 30 minutes forever.
     */
    if (!dryRun) {
      await db.update(orders).set({ postNordLastPolledAt: now }).where(eq(orders.id, order.id));
    }
    return { changed: false, emailed: 0, failed: 0, skipped: true };
  }

  const parsed = parseTrackingResponse(res.data);
  if (!parsed.status) {
    if (!dryRun) {
      await db.update(orders).set({ postNordLastPolledAt: now }).where(eq(orders.id, order.id));
    }
    return { changed: false, emailed: 0, failed: 0, skipped: true };
  }

  const status = parsed.status;
  const changed = status !== order.postNordStatus;

  /** First moment we saw it collectable — the clock the reminders run on. */
  const availableAt =
    order.postNordAvailableAt ?? (isAwaitingPickup(status) ? now : null);

  if (!dryRun) {
    const patch: Record<string, unknown> = { postNordLastPolledAt: now };

    if (changed) {
      patch.postNordStatus = status;
      patch.postNordStatusAt = now;
      if (isAwaitingPickup(status) && !order.postNordAvailableAt) {
        patch.postNordAvailableAt = now;
      }
      if (parsed.deliveryDate) {
        const d = new Date(parsed.deliveryDate);
        if (!Number.isNaN(d.getTime())) patch.postNordDeliveredAt = d;
      }
      if (parsed.estimatedTimeOfArrival) {
        const d = new Date(parsed.estimatedTimeOfArrival);
        if (!Number.isNaN(d.getTime())) patch.postNordEta = d;
      }

      /**
       * Move our own status too — but never drag an order out of a state a
       * human put it in. A cancelled or refunded order whose parcel is still
       * wandering around stays cancelled.
       */
      const mapped = mapToOrderStatus(status);
      const frozen = ["cancelled", "refunded", "partially_refunded", "completed"];
      if (mapped && !frozen.includes(order.status)) {
        patch.status = mapped;
      }
    }

    await db.update(orders).set(patch).where(eq(orders.id, order.id));
  }

  if (isException(status)) {
    return { changed, emailed: 0, failed: 0, skipped: false, exception: status };
  }

  const { send, supersede } = emailsDue(status, availableAt, now);

  // Record superseded mails as handled so they can never fire later.
  for (const kind of supersede) {
    const claim = await claimOrderEmail(order.id, kind, {
      superseded: true,
      observedStatus: status,
    });
    if (claim.claimed) {
      if (dryRun) await releaseOrderEmail(claim.id);
      else await markOrderEmailSent(claim.id, null);
    }
  }

  let emailed = 0;
  let failed = 0;
  for (const due of send) {
    const claim = await claimOrderEmail(order.id, due.kind, {
      trackingId: tid,
      observedStatus: status,
      reason: due.reason,
    });
    if (!claim.claimed) continue;

    if (dryRun) {
      console.log(`[shipping-sync] DRY RUN would send ${due.kind} for order #${order.id} (${due.reason})`);
      await releaseOrderEmail(claim.id);
      emailed++;
      continue;
    }

    try {
      const sent = await sendOrderNotification(order.id, due.kind);
      if (!sent.sent) {
        /**
         * Declined by configuration, not failed. Release the claim rather than
         * recording it sent — otherwise switching the setting back on would
         * never deliver this mail, because the ledger would say it already had.
         */
        await releaseOrderEmail(claim.id);
        console.log(`[shipping-sync] ${due.kind} skipped for order #${order.id}: ${sent.skipped}`);
        continue;
      }
      await markOrderEmailSent(claim.id, sent.recipient ?? null);
      emailed++;
    } catch (err) {
      await markOrderEmailFailed(claim.id, err);
      console.error(`[shipping-sync] ${due.kind} failed for order #${order.id}:`, err);
      failed++;
    }
  }

  return { changed, emailed, failed, skipped: false };
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * An arbitrary but fixed key. Any 32-bit int works; it only has to be the same
 * in every process that runs this job. (Postgres also accepts a single 64-bit
 * key, but admin targets ES2017 and cannot write a BigInt literal.)
 */
const ADVISORY_LOCK_KEY = 874_221_903;

/**
 * Runs one sweep.
 *
 * The name is unchanged from the old implementation because two call sites
 * import it: the in-process cron in `instrumentation.ts` and the authenticated
 * `/api/cron/sync-shipping-status` route.
 *
 * Those two can fire at the same instant — the plan is for an OS crontab to
 * back up the in-process timer, which dies on every pm2 restart. The advisory
 * lock makes the second one a no-op rather than a duplicate sweep.
 */
export async function syncShippingStatus(): Promise<ShippingSyncResult> {
  const dryRun = isDryRun();

  const [lock] = await db.execute<{ locked: boolean }>(
    sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`,
  );
  if (!lock?.locked) {
    console.log("[shipping-sync] another run holds the lock; skipping");
    return { checked: 0, updated: 0, emailed: 0, failed: 0, skipped: 0, exceptions: [], dryRun, lockedOut: true };
  }

  try {
    const candidates = await selectCandidates();
    const result: ShippingSyncResult = {
      checked: candidates.length,
      updated: 0,
      emailed: 0,
      failed: 0,
      skipped: 0,
      exceptions: [],
      dryRun,
    };

    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY);
      const outcomes = await Promise.all(
        batch.map(async (order) => {
          try {
            return await syncOne(order, dryRun);
          } catch (err) {
            console.error(`[shipping-sync] order #${order.id} failed:`, err);
            return { changed: false, emailed: 0, failed: 1, skipped: true } satisfies OrderOutcome;
          }
        }),
      );
      outcomes.forEach((o, n) => {
        if (o.changed) result.updated++;
        if (o.skipped) result.skipped++;
        result.emailed += o.emailed;
        result.failed += o.failed;
        const order = batch[n];
        if (o.exception && order) {
          result.exceptions.push({ orderId: order.id, status: o.exception });
        }
      });
    }

    if (result.checked > 0) {
      console.log(
        `[shipping-sync]${dryRun ? " DRY RUN" : ""} checked ${result.checked}, ` +
          `changed ${result.updated}, emailed ${result.emailed}, failed ${result.failed}, skipped ${result.skipped}`,
      );
    }
    if (result.exceptions.length > 0) {
      console.warn("[shipping-sync] parcels needing attention:", result.exceptions);
    }

    return result;
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
  }
}

/** Re-exported so callers can name the terminal states without importing the package. */
export { isTerminal };
