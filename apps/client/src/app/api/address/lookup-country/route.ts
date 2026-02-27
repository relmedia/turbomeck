import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/address/lookup-country?postalCode=12345&city=Stockholm
 * Looks up country from postal code using Nominatim (OpenStreetMap).
 * Returns: { countryCode: string } or { error: string }
 * Rate limit: Nominatim allows 1 req/sec - we cache briefly.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const postalCode = searchParams.get("postalCode")?.replace(/\s/g, "").trim();
  const city = searchParams.get("city")?.trim();

  if (!postalCode || postalCode.length < 3) {
    return NextResponse.json(
      { error: "postalCode required, at least 3 characters" },
      { status: 400 }
    );
  }

  const query = city ? `${postalCode} ${city}` : postalCode;

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Turbomeck/1.0 (address lookup)",
      },
      next: { revalidate: 86400 }, // cache 24h for same query
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Address lookup failed" },
        { status: 502 }
      );
    }

    const data = (await res.json()) as Array<{
      address?: { country_code?: string; country?: string };
    }>;

    const first = data?.[0];
    const countryCode = first?.address?.country_code?.toUpperCase();

    if (!countryCode || countryCode.length !== 2) {
      return NextResponse.json(
        { error: "Could not determine country from address" },
        { status: 404 }
      );
    }

    return NextResponse.json({ countryCode });
  } catch (err) {
    console.error("[address lookup-country]", err);
    return NextResponse.json(
      { error: "Address lookup failed" },
      { status: 500 }
    );
  }
}
