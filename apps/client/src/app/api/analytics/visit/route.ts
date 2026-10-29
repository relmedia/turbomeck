import { db } from "@repo/database";
import { pageVisits } from "@repo/database/schema";
import { NextResponse } from "next/server";
import { resolveVisitorGeo } from "@/lib/visitor-geo";

const ALLOWED_DEVICES = ["mobile", "desktop", "tablet"] as const;
const ALLOWED_BROWSERS = ["chrome", "safari", "firefox", "edge", "other"] as const;

/**
 * POST /api/analytics/visit - Log a page visit with device, browser and a
 * coarse location (no auth).
 *
 * The location is resolved HERE, from the request headers, and never taken
 * from the body: the browser does not know it, and a value it did send would
 * be trivially forgeable -- the dashboard would be reporting whatever a
 * scraper felt like claiming.
 */
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

    // Never allowed to cost us the visit: resolveVisitorGeo swallows its own
    // failures and returns nulls, which is exactly how an unresolved visit is
    // meant to be stored.
    const geo = await resolveVisitorGeo(
      req.headers instanceof Headers ? req.headers : new Headers(),
    );

    await db.insert(pageVisits).values({
      deviceType: validDevice,
      browser: validBrowser,
      path: path ?? null,
      country: geo.country,
      region: geo.region,
      city: geo.city,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to log visit:", err);
    return NextResponse.json({ error: "Failed to log visit" }, { status: 500 });
  }
}
