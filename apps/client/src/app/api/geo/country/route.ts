import { NextRequest, NextResponse } from "next/server";
import { clientIpFromHeaders } from "@repo/auth/client-ip";

/**
 * GET /api/geo/country
 *
 * The visitor's country (ISO 3166-1 alpha-2), used to pick sensible defaults in
 * the cart and on a product page (Swedish vs. export rules). A guess: never
 * trusted for pricing, tax or the charge currency, all of which come from the
 * shipping country the customer actually selects.
 *
 * Shares its signals with `lib/display-currency.ts` — edge header first, then
 * one HTTPS lookup — so the shop has exactly one geolocation provider to name
 * in the privacy policy rather than two.
 *
 * Response: { country: string } or { country: null }
 */

const LOOKUP_TIMEOUT_MS = 1500;

export async function GET(request: NextRequest) {
  // Free, instant and nothing leaves the server: whatever the edge already
  // knows. Installing nginx's GeoIP2 module later populates x-country here.
  for (const name of ["cf-ipcountry", "x-country", "x-vercel-ip-country"]) {
    const value = request.headers.get(name)?.trim().toUpperCase();
    if (value && value.length === 2 && value !== "XX") {
      return NextResponse.json({ country: value });
    }
  }

  // Not `x-forwarded-for[0]`: that hop is whatever the client sent and is
  // trivially spoofed. clientIpFromHeaders walks the chain the way the proxy
  // in front of us actually writes it.
  const clientIp = clientIpFromHeaders(request.headers);
  if (!clientIp || clientIp === "unknown") {
    return NextResponse.json({ country: null });
  }

  try {
    // ipwho.is over HTTPS. The previous implementation called ip-api.com over
    // plain http://, which put the visitor's IP address on the wire in the
    // clear for every network between here and there.
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(clientIp)}?fields=success,country_code`,
      {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      },
    );
    const data = (await res.json()) as {
      success?: boolean;
      country_code?: string;
    };
    if (data?.success && data?.country_code) {
      return NextResponse.json({ country: data.country_code.toUpperCase() });
    }
  } catch {
    // Non-blocking: an unknown country just means no pre-filled default.
  }

  return NextResponse.json({ country: null });
}
