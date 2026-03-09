import cron from "node-cron";
import { syncShippingStatus } from "./src/lib/sync-shipping-status";

/**
 * Runs syncShippingStatus every 2 hours.
 * Only runs in Node.js runtime (not Edge).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  cron.schedule("0 */2 * * *", async () => {
    try {
      const { checked, updated } = await syncShippingStatus();
      if (checked > 0) {
        console.log(`[cron] sync-shipping-status: checked ${checked}, updated ${updated}`);
      }
    } catch (err) {
      console.error("[cron] sync-shipping-status failed:", err);
    }
  });

  console.log("[cron] Shipping status sync scheduled (every 2 hours)");
}
