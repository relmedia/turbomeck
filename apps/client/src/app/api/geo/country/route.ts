import { NextRequest, NextResponse } from "next/server";
import { resolveVisitorGeo } from "@/lib/visitor-geo";

/**
 * GET /api/geo/country
 *
 * The visitor's country (ISO 3166-1 alpha-2), used to pick sensible defaults in
 * the cart and on a product page (Swedish vs. export rules). A guess: never
 * trusted for pricing, tax or the charge currency, all of which come from the
 * shipping country the customer actually selects.
 *
 * The resolution itself lives in `lib/visitor-geo.ts`, shared with visit
 * logging and with `lib/display-currency.ts`, so the shop has exactly one
 * geolocation provider to name in the privacy policy rather than one per
 * feature.
 *
 * Response: { country: string } or { country: null }
 */

export async function GET(request: NextRequest) {
  const { country } = await resolveVisitorGeo(request.headers);
  return NextResponse.json({ country });
}
