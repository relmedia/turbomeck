import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/geo/country
 * Returns the user's country code (ISO 3166-1 alpha-2) based on IP geolocation.
 * Uses Vercel/Cloudflare headers when available, otherwise falls back to ip-api.com.
 * Response: { country: string } or { country: null }
 */
export async function GET(request: NextRequest) {
  // 1. Vercel injects geo at the edge
  const vercelCountry = request.headers.get("x-vercel-ip-country");
  if (vercelCountry && vercelCountry.length === 2) {
    return NextResponse.json({ country: vercelCountry.toUpperCase() });
  }

  // 2. Cloudflare
  const cfCountry = request.headers.get("cf-ipcountry");
  if (cfCountry && cfCountry.length === 2 && cfCountry !== "XX") {
    return NextResponse.json({ country: cfCountry.toUpperCase() });
  }

  // 3. Fallback: get client IP and call ip-api.com (free, no key)
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  const clientIp =
    cfConnectingIp ?? realIp ?? forwarded?.split(",")[0]?.trim() ?? null;

  if (!clientIp) {
    return NextResponse.json({ country: null });
  }

  try {
    const res = await fetch(
      `http://ip-api.com/json/${clientIp}?fields=status,countryCode`,
      { next: { revalidate: 3600 } }
    );
    const data = (await res.json()) as { status?: string; countryCode?: string };
    if (data?.status === "success" && data?.countryCode) {
      return NextResponse.json({ country: data.countryCode.toUpperCase() });
    }
  } catch {
    // Non-blocking
  }

  return NextResponse.json({ country: null });
}
