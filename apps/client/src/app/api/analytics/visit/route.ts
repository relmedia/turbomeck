import { db } from "@repo/database";
import { pageVisits } from "@repo/database/schema";
import { NextResponse } from "next/server";

const ALLOWED_DEVICES = ["mobile", "desktop", "tablet"] as const;
const ALLOWED_BROWSERS = ["chrome", "safari", "firefox", "edge", "other"] as const;

/** POST /api/analytics/visit - Log a page visit with device and browser (no auth) */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceType = String(body?.deviceType ?? "desktop").toLowerCase();
    const browser = String(body?.browser ?? "other").toLowerCase();
    const path = typeof body?.path === "string" ? body.path : null;

    const validDevice = ALLOWED_DEVICES.includes(deviceType as (typeof ALLOWED_DEVICES)[number])
      ? deviceType
      : "desktop";
    const validBrowser = ALLOWED_BROWSERS.includes(browser as (typeof ALLOWED_BROWSERS)[number])
      ? browser
      : "other";

    await db.insert(pageVisits).values({
      deviceType: validDevice,
      browser: validBrowser,
      path: path ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to log visit:", err);
    return NextResponse.json({ error: "Failed to log visit" }, { status: 500 });
  }
}
