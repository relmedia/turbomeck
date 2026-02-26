import { NextRequest, NextResponse } from "next/server";
import {
  getNearbyServicePoints,
  geocodePostalCode,
  POSTNORD_SERVICE_POINT_COUNTRIES,
} from "@/lib/postnord";

/**
 * GET /api/postnord/servicepoints?postalCode=12345&city=Stockholm&country=SE
 * Returns nearby PostNord service points. Supports Sweden (SE), Norway (NO), Denmark (DK).
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const postalCode = (searchParams.get("postalCode") ?? searchParams.get("postnummer"))?.trim();
  const city = (searchParams.get("city") ?? searchParams.get("ort"))?.trim();
  const country = (searchParams.get("country") ?? searchParams.get("land") ?? "SE")
    .toUpperCase()
    .trim();

  if (!postalCode || postalCode.length < 3) {
    return NextResponse.json(
      { error: "postalCode (postnummer) krävs, minst 3 tecken" },
      { status: 400 }
    );
  }

  if (!POSTNORD_SERVICE_POINT_COUNTRIES.includes(country as "SE" | "NO" | "DK")) {
    return NextResponse.json(
      { error: "PostNord ombud finns för Sverige, Norge och Danmark. Välj ett av dessa länder." },
      { status: 400 }
    );
  }

  const FALLBACK_COORDS: Record<string, [number, number]> = {
    SE: [59.33, 18.07],
    NO: [59.91, 10.75],
    DK: [55.68, 12.57],
  };
  const [fallbackLat, fallbackLng] = FALLBACK_COORDS[country] ?? FALLBACK_COORDS.SE;

  try {
    const cleanPostal = postalCode.replace(/\s/g, "").trim();
    const coords = await geocodePostalCode(postalCode, country, city || undefined);

    const servicePoints = await getNearbyServicePoints(
      coords?.latitude ?? fallbackLat,
      coords?.longitude ?? fallbackLng,
      {
        locale: country === "NO" ? "nb" : country === "DK" ? "da" : "sv",
        countryCode: country,
        postalCode: cleanPostal,
        city: city || undefined,
      }
    );

    return NextResponse.json({ servicePoints });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PostNord API-fel";
    console.error("[postnord/servicepoints]", err);
    return NextResponse.json(
      { error: message },
      { status: 502 }
    );
  }
}
