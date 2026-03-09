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

  if (secret) {
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : cronSecret;
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
