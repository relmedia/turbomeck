import { NextRequest, NextResponse } from "next/server";
import { getShippingPrice } from "@/lib/postnord";

/**
 * GET /api/postnord/postpaket-price?weightKg=2.5&deliveryOption=servicepoint&country=SE
 * Returns PostNord Postpaket and hemleverans prices in SEK.
 * deliveryOption: "servicepoint" | "home" (default: servicepoint)
 * country: ISO country code (default: SE) - supports all European countries
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const weightParam = searchParams.get("weightKg") ?? searchParams.get("weight");
  const deliveryOption = searchParams.get("deliveryOption") ?? "servicepoint";
  const country = searchParams.get("country") ?? "SE";

  const weightKg = parseFloat(weightParam ?? "1");
  if (isNaN(weightKg) || weightKg <= 0) {
    return NextResponse.json(
      { error: "weightKg krävs och måste vara ett positivt tal" },
      { status: 400 }
    );
  }

  const postpaketPrice = getShippingPrice(weightKg, country, "servicepoint");
  const homeDeliveryPrice = getShippingPrice(weightKg, country, "home");

  return NextResponse.json({
    weightKg,
    country,
    postpaket: postpaketPrice,
    hemleverans: homeDeliveryPrice,
    price:
      deliveryOption === "home" ? homeDeliveryPrice : postpaketPrice,
  });
}
