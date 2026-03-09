import { auth } from "@repo/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/postnord/track?trackingId=XXX
 * PostNord Track Shipment API – fetches tracking status for a shipment.
 * @see https://developer.postnord.com/apis/details?systemName=shipment-v7-trackandtrace-findbyidentifier-public
 * @see https://www.postnord.com/integrations/track-shipment-api
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const trackingId = searchParams.get("trackingId")?.trim();

  if (!trackingId) {
    return NextResponse.json(
      { error: "trackingId query parameter required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.POSTNORD_API_KEY?.trim();
  if (!apiKey || apiKey === "your_postnord_api_key_here") {
    return NextResponse.json(
      { error: "PostNord API key not configured. Add POSTNORD_API_KEY to .env" },
      { status: 503 }
    );
  }

  const host =
    process.env.POSTNORD_USE_TEST_API === "true"
      ? "atapi2.postnord.com"
      : process.env.POSTNORD_API_HOST ?? "api2.postnord.com";

  // Try v2 (documented) and v7 (portal) – PostNord versioning varies by API key
  const url = new URL(`https://${host}/rest/shipment/v2/trackandtrace/findByIdentifier.json`);
  url.searchParams.set("id", trackingId);
  url.searchParams.set("locale", "sv");
  url.searchParams.set("apikey", apiKey);

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        {
          error: data?.TrackingInformationResponse?.serviceCode
            ? `PostNord: ${data.TrackingInformationResponse.serviceCode}`
            : "Kunde inte hämta spårningsinformation",
        },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    // PostNord returns TrackingInformationResponse with shipments
    return NextResponse.json(data);
  } catch (err) {
    console.error("[postnord/track]", err);
    return NextResponse.json(
      { error: "Kunde inte ansluta till PostNord" },
      { status: 502 }
    );
  }
}
