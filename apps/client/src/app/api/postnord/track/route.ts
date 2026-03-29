import { auth } from "@repo/auth";
import { NextResponse } from "next/server";
import { PRODUCT_API } from "@/lib/product-api";
import { internalProductApiAuthHeaders } from "@/lib/internal-product-api";
import { fetchPostNordTrackingJson } from "@/lib/postnord-track-shipment";

/**
 * GET /api/postnord/track?orderId=123&locale=sv|en
 * Loads PostNord tracking for the signed-in customer's order only (server verifies ownership).
 * Uses Track Shipment v5 by default; see POSTNORD_TRACK_SHIPMENT_VERSION.
 * @see https://developer.postnord.com/apis/details/YOoaIYIBtTJB9kBCpFRe
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const orderIdRaw = searchParams.get("orderId")?.trim();
  const orderId = orderIdRaw ? parseInt(orderIdRaw, 10) : NaN;
  if (!Number.isFinite(orderId) || orderId < 1) {
    return NextResponse.json({ error: "orderId query parameter required" }, { status: 400 });
  }

  const localeParam = searchParams.get("locale")?.trim().toLowerCase();
  const locale = localeParam === "en" ? "en" : "sv";

  const orderUrl = `${PRODUCT_API}/orders/${orderId}?userId=${encodeURIComponent(session.user.id)}`;
  const orderRes = await fetch(orderUrl, {
    cache: "no-store",
    headers: internalProductApiAuthHeaders(),
  });

  if (orderRes.status === 403 || orderRes.status === 404) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (!orderRes.ok) {
    return NextResponse.json({ error: "Could not load order" }, { status: 502 });
  }

  const order = (await orderRes.json()) as { postNordTrackingId?: string | null };
  const trackingId = order.postNordTrackingId?.trim();
  if (!trackingId) {
    return NextResponse.json(
      { error: "No tracking number for this order yet" },
      { status: 404 },
    );
  }

  const result = await fetchPostNordTrackingJson(trackingId, locale);
  if (!result.ok) {
    if (result.status === 503) {
      return NextResponse.json(
        { error: "PostNord API key not configured on storefront" },
        { status: 503 },
      );
    }
    const data = result.data as Record<string, unknown> | null | undefined;
    const tir = data?.TrackingInformationResponse as { serviceCode?: string } | undefined;
    const code = typeof tir?.serviceCode === "string" ? tir.serviceCode : null;
    return NextResponse.json(
      {
        error: code ? `PostNord: ${code}` : "Could not load tracking information",
        postNordResponse: data ?? result.data,
      },
      { status: result.status >= 500 ? 502 : result.status },
    );
  }

  return NextResponse.json(result.data);
}
