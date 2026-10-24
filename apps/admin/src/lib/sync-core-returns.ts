/**
 * Chases outstanding kärnreturer (core returns).
 *
 * Sweden's flow lets a customer skip the upfront core fee by committing to send
 * the old turbo back within 14 days. The order row has carried everything
 * needed to enforce that since it was built — `commitsCoreReturnWithin14`,
 * `coreReturnDeadline`, `coreReceivedAt` — and **nothing in the repo read any
 * of it**. A deadline nobody is reminded of and nobody is told has passed is
 * worth 1 000 kr per order, uncollected.
 *
 * Two mails, both through the same ledger as the shipping notices so each is
 * sent exactly once:
 *
 *   core_return_reminder  — to the customer, shortly BEFORE the deadline,
 *                           while they can still act on it.
 *   core_return_overdue   — to staff, just after, so the fee is actually
 *                           invoiced instead of quietly forgotten.
 *
 * Deliberately NOT automated: charging the customer. That is a money decision
 * with a human on the other end of it, and the shop may well choose to wait.
 */

import { db } from "@repo/database";
import { orders } from "@repo/database/schema";
import { and, eq, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";
import {
  claimOrderEmail,
  markOrderEmailSent,
  markOrderEmailFailed,
  releaseOrderEmail,
  type OrderEmailKind,
} from "@/lib/order-email-ledger";
import { sendOrderNotification } from "@/lib/trigger-order-notification";

/** Days before the deadline to nudge the customer. */
function reminderLeadDays(): number {
  const raw = Number(process.env.CORE_RETURN_REMINDER_DAYS?.trim());
  return Number.isFinite(raw) && raw > 0 ? raw : 3;
}

/** Days after the deadline before telling staff it lapsed. */
function overdueGraceDays(): number {
  const raw = Number(process.env.CORE_RETURN_OVERDUE_DAYS?.trim());
  return Number.isFinite(raw) && raw >= 0 ? raw : 1;
}

function isDryRun(): boolean {
  return process.env.SHIPPING_SYNC_DRY_RUN === "true";
}

export type CoreReturnSyncResult = {
  checked: number;
  reminded: number;
  flaggedOverdue: number;
  failed: number;
  dryRun: boolean;
  lockedOut?: boolean;
};

const ADVISORY_LOCK_KEY = 874_221_904;

export async function syncCoreReturns(): Promise<CoreReturnSyncResult> {
  const dryRun = isDryRun();

  const [lock] = await db.execute<{ locked: boolean }>(
    sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`,
  );
  if (!lock?.locked) {
    return { checked: 0, reminded: 0, flaggedOverdue: 0, failed: 0, dryRun, lockedOut: true };
  }

  try {
    const now = new Date();
    const reminderCutoff = new Date(now.getTime() + reminderLeadDays() * 86_400_000);

    /**
     * Open commitments only. An order that was cancelled or refunded has no
     * core to chase, and one where the old part already arrived
     * (`coreReceivedAt`) is settled.
     */
    const rows = await db
      .select({
        id: orders.id,
        deadline: orders.coreReturnDeadline,
        status: orders.status,
      })
      .from(orders)
      .where(
        and(
          eq(orders.commitsCoreReturnWithin14, true),
          isNull(orders.coreReceivedAt),
          isNotNull(orders.coreReturnDeadline),
          notInArray(orders.status, ["cancelled", "refunded", "partially_refunded"]),
          // Nothing to do until the reminder window opens.
          lt(orders.coreReturnDeadline, reminderCutoff),
        ),
      );

    const result: CoreReturnSyncResult = {
      checked: rows.length,
      reminded: 0,
      flaggedOverdue: 0,
      failed: 0,
      dryRun,
    };

    const overdueBefore = new Date(now.getTime() - overdueGraceDays() * 86_400_000);

    for (const row of rows) {
      if (!row.deadline) continue;

      const kind: OrderEmailKind =
        row.deadline < overdueBefore ? "core_return_overdue" : "core_return_reminder";

      const claim = await claimOrderEmail(row.id, kind, {
        deadline: row.deadline.toISOString(),
        orderStatus: row.status,
      });
      if (!claim.claimed) continue;

      if (dryRun) {
        console.log(
          `[core-returns] DRY RUN would send ${kind} for order #${row.id} (deadline ${row.deadline.toISOString().slice(0, 10)})`,
        );
        await releaseOrderEmail(claim.id);
        if (kind === "core_return_overdue") result.flaggedOverdue++;
        else result.reminded++;
        continue;
      }

      try {
        const sent = await sendOrderNotification(row.id, kind);
        if (!sent.sent) {
          await releaseOrderEmail(claim.id);
          continue;
        }
        await markOrderEmailSent(claim.id, sent.recipient ?? null);
        if (kind === "core_return_overdue") result.flaggedOverdue++;
        else result.reminded++;
      } catch (err) {
        await markOrderEmailFailed(claim.id, err);
        console.error(`[core-returns] ${kind} failed for order #${row.id}:`, err);
        result.failed++;
      }
    }

    if (result.checked > 0) {
      console.log(
        `[core-returns]${dryRun ? " DRY RUN" : ""} checked ${result.checked}, ` +
          `reminded ${result.reminded}, overdue ${result.flaggedOverdue}, failed ${result.failed}`,
      );
    }
    return result;
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
  }
}
