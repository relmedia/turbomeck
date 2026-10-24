/**
 * Next.js instrumentation hook. Runs in BOTH Node.js and Edge runtimes, so anything
 * that imports Node-only modules (node:dns, node:http, etc.) MUST be loaded via a
 * dynamic import gated on NEXT_RUNTIME === "nodejs". Static top-level imports get
 * pulled into the Edge bundle and trigger
 *   "A Node.js module is loaded ('node:dns') which is not supported in the Edge Runtime."
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ default: cron }, { syncShippingStatus }, { syncCoreReturns }] = await Promise.all([
    import("node-cron"),
    import("./src/lib/sync-shipping-status"),
    import("./src/lib/sync-core-returns"),
  ]);

  /**
   * Every 30 minutes, not every 2 hours.
   *
   * The job now drives customer email, and the pickup reminders run on a clock
   * measured in days against a 3-day PostNord hold — a 2-hour granularity was
   * fine for "is it delivered yet" and is not fine for "tell them before it is
   * sent back". The poller rate-limits itself per order (30 min minimum,
   * backing off to daily after two quiet weeks), so a tighter schedule does not
   * mean more PostNord calls for the same parcel.
   *
   * This timer lives inside the Next.js process and therefore dies on every pm2
   * restart and redeploy. An OS crontab hitting
   * /api/cron/sync-shipping-status is the intended backstop. Both firing at
   * once is safe: the job takes a Postgres advisory lock, and the order_emails
   * unique index makes a duplicate send impossible even if that lock were lost.
   */
  cron.schedule("*/30 * * * *", async () => {
    try {
      const { checked, updated, emailed, failed } = await syncShippingStatus();
      if (checked > 0) {
        console.log(
          `[cron] sync-shipping: checked ${checked}, updated ${updated}, emailed ${emailed}, failed ${failed}`,
        );
      }
    } catch (err) {
      console.error("[cron] sync-shipping failed:", err);
    }
  });

  /**
   * Core returns run once a day, not every 30 minutes: the deadline is a date,
   * so checking it more often would only produce the same answer 48 times.
   * 09:00 so the staff "overdue" notice lands at the start of a working day
   * rather than overnight.
   */
  cron.schedule("0 9 * * *", async () => {
    try {
      const { checked, reminded, flaggedOverdue } = await syncCoreReturns();
      if (checked > 0) {
        console.log(
          `[cron] core-returns: checked ${checked}, reminded ${reminded}, overdue ${flaggedOverdue}`,
        );
      }
    } catch (err) {
      console.error("[cron] core-returns failed:", err);
    }
  });

  console.log("[cron] Shipping sync (30 min) and core-return chase (daily 09:00) scheduled");
}
