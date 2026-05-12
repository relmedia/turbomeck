import { NextResponse } from "next/server";
import { syncShippingStatus } from "@/lib/sync-shipping-status";

/**
 * GET /api/cron/sync-shipping-status
 * Polls PostNord Track API for shipped orders and auto-updates to "delivered" when PostNord reports delivery.
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
    const { checked, updated } = await syncShippingStatus();
    return NextResponse.json({ ok: true, checked, updated });
  } catch (err) {
    console.error("[cron/sync-shipping-status]", err);
    return NextResponse.json(
      { error: "Sync failed", details: String(err) },
      { status: 500 }
    );
  }
}
