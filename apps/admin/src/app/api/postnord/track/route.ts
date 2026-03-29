import { auth } from "@repo/auth";
import { NextResponse } from "next/server";
import { fetchPostNordTrackingJson } from "@/lib/postnord-track-shipment";

/**
 * GET /api/postnord/track?trackingId=XXX
 * PostNord Track Shipment API (default **v5** findByIdentifier; falls back to v2 on 404).
 * @see https://developer.postnord.com/apis/details/YOoaIYIBtTJB9kBCpFRe
 * @see https://www.postnord.com/integrations/track-shipment-api
 *
 * Override version: `POSTNORD_TRACK_SHIPMENT_VERSION=v2` in .env
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
      { status: 400 },
    );
  }

  const locale = searchParams.get("locale")?.trim() || "sv";

  const result = await fetchPostNordTrackingJson(trackingId, locale);
  if (!result.ok) {
    if (result.status === 503) {
      return NextResponse.json(
        { error: "PostNord API key not configured. Add POSTNORD_API_KEY to .env" },
        { status: 503 },
      );
    }
    const data = result.data as Record<string, unknown> | null | undefined;
    const tir = data?.TrackingInformationResponse as { serviceCode?: string } | undefined;
    const code = typeof tir?.serviceCode === "string" ? tir.serviceCode : null;
    return NextResponse.json(
      {
        error: code ? `PostNord: ${code}` : "Kunde inte hämta spårningsinformation",
        postNordResponse: data ?? result.data,
      },
      { status: result.status >= 500 ? 502 : result.status },
    );
  }

  return NextResponse.json(result.data);
}
