import { NextResponse } from "next/server";
import { syncShippingStatus } from "@/lib/sync-shipping-status";
import { syncCoreReturns } from "@/lib/sync-core-returns";

/**
 * GET /api/cron/sync-shipping-status
 * Runs both automated sweeps: the PostNord status poll (which moves order
 * status and sends the shipping emails) and the kärnretur chase.
 *
 * Intended to be called by an OS crontab as a backstop for the in-process
 * timer in instrumentation.ts, which dies on every pm2 restart. Running both
 * at once is safe — each sweep takes an advisory lock and every mail is
 * guarded by the order_emails unique index.
 * Protect with CRON_SECRET: call with Authorization: Bearer <CRON_SECRET> or x-cron-secret header.
 * Also runs automatically via node-cron every 2 hours when the app is running.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  const secret = process.env.CRON_SECRET?.trim();

  // SECURITY: fail closed. Previously the auth block was wrapped in
  // `if (secret) { ... }`, which silently allowed anonymous calls when
  // CRON_SECRET was unset — combined with proxy.ts exempting /api/cron/* from
  // the session gate, that exposed the handler to the public internet.
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "CRON_SECRET is not configured" },
        { status: 503 }
      );
    }
    // Dev / test: allow without a secret so local invocations keep working.
    console.warn(
      "[cron/sync-shipping-status] CRON_SECRET unset — allowing dev request"
    );
  } else {
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : cronSecret;
    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    /**
     * Both sweeps run from one heartbeat so a single OS crontab entry covers
     * everything. Core returns are cheap (one indexed query, usually zero
     * rows) and each mail is ledger-guarded, so running them on the 30-minute
     * shipping cadence costs nothing and sends nothing extra.
     */
    const shipping = await syncShippingStatus();
    const coreReturns = await syncCoreReturns();
    return NextResponse.json({
      ok: true,
      checked: shipping.checked,
      updated: shipping.updated,
      shipping,
      coreReturns,
    });
  } catch (err) {
    console.error("[cron/sync-shipping-status]", err);
    return NextResponse.json(
      { error: "Sync failed", details: String(err) },
      { status: 500 }
    );
  }
}
