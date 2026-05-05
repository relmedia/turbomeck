/**
 * Next.js instrumentation hook. Runs in BOTH Node.js and Edge runtimes, so anything
 * that imports Node-only modules (node:dns, node:http, etc.) MUST be loaded via a
 * dynamic import gated on NEXT_RUNTIME === "nodejs". Static top-level imports get
 * pulled into the Edge bundle and trigger
 *   "A Node.js module is loaded ('node:dns') which is not supported in the Edge Runtime."
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ default: cron }, { syncShippingStatus }] = await Promise.all([
    import("node-cron"),
    import("./src/lib/sync-shipping-status"),
  ]);

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
