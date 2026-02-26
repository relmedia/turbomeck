import { NextRequest, NextResponse } from "next/server";
import {
  getNearbyServicePoints,
  geocodeSwedishPostalCode,
} from "@/lib/postnord";

/**
 * GET /api/postnord/servicepoints?postalCode=12345&city=Stockholm
 * Returns nearby PostNord service points for a Swedish postal code.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const postalCode = searchParams.get("postalCode") ?? searchParams.get("postnummer");
  const city = searchParams.get("city") ?? searchParams.get("ort");

  if (!postalCode || postalCode.length < 4) {
    return NextResponse.json(
      { error: "postalCode (postnummer) krävs, minst 4 tecken" },
      { status: 400 }
    );
  }

  const coords = await geocodeSwedishPostalCode(postalCode, city ?? undefined);
  if (!coords) {
    return NextResponse.json(
      { error: "Kunde inte hitta plats för angivet postnummer" },
      { status: 404 }
    );
  }

  const servicePoints = await getNearbyServicePoints(coords.latitude, coords.longitude, {
    maxResults: 10,
    radius: 15000, // 15 km
    locale: "sv",
  });

  return NextResponse.json({ servicePoints });
}
