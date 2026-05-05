import { NextRequest, NextResponse } from "next/server";
import { extractPostNordTrackableShipmentId } from "@/lib/postnord-shipment-response-id";

const API_URL = process.env.POSTNORD_SHIPPING_API_URL;
const API_KEY = process.env.POSTNORD_SHIPPING_API_KEY;
const SITE_CODE = process.env.POSTNORD_SITE_CODE ?? "acmeSE";

/**
 * PUT /api/postnord/shipping/complete-session/[sessionId]
 * Completes the PostNord session after checkout. Returns trackable shipment id when present.
 * Forwards the session token from the client when present (preferred over apikey by PostNord).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  if (!API_URL || !API_KEY || !sessionId) {
    return NextResponse.json(
      { error: "PostNord Shipping Module not configured or missing session ID" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { deliveryAddress = {}, userInputs = {} } = body as {
      deliveryAddress?: {
        firstName?: string;
        lastName?: string;
        address?: string;
        postalCode?: string;
        zip?: string;
        city?: string;
        country?: string;
        companyName?: string;
        type?: string;
      };
      userInputs?: { email?: string; phone?: string; phoneCountryTwoLetterIso?: string };
    };

    const country = (deliveryAddress.country ?? "SE").toUpperCase();
    const addressType = deliveryAddress.type ?? (deliveryAddress.companyName ? "Company" : "Private");

    const payload: Record<string, unknown> = {
      id: sessionId,
      checkoutSite: {
        siteCode: SITE_CODE,
        countryCode: country,
        currencyCode: "SEK",
      },
      deliveryAddress: {
        address1: deliveryAddress.address ?? null,
        address2: null,
        street: deliveryAddress.address ?? null,
        zip: deliveryAddress.postalCode ?? deliveryAddress.zip ?? null,
        city: deliveryAddress.city ?? null,
        type: addressType,
        firstName: deliveryAddress.firstName ?? null,
        lastName: deliveryAddress.lastName ?? null,
        country,
        ...(deliveryAddress.companyName ? { companyName: deliveryAddress.companyName } : {}),
      },
      userInputs: {
        email: userInputs.email ?? null,
        phoneCountryTwoLetterIso:
          (userInputs.phoneCountryTwoLetterIso ?? country).toUpperCase(),
        phone: userInputs.phone ?? null,
      },
    };

    const auth = request.headers.get("authorization") ?? API_KEY;

    const res = await fetch(
      `${API_URL.replace(/\/+$/, "")}/complete-session/${encodeURIComponent(sessionId)}`,
      {
        method: "PUT",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[PostNord complete-session]", res.status, text);
      return NextResponse.json(
        { error: "Failed to complete PostNord session", details: text },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const data: unknown = await res.json();
    const extracted = extractPostNordTrackableShipmentId(data);
    if (data && typeof data === "object" && extracted) {
      const d = data as Record<string, unknown>;
      const hasTop =
        (typeof d.shipmentId === "string" && d.shipmentId.trim()) ||
        (typeof d.trackingId === "string" && d.trackingId.trim());
      if (!hasTop) {
        return NextResponse.json({ ...d, shipmentId: extracted });
      }
    } else if (data && typeof data === "object" && !extracted) {
      console.warn(
        "[PostNord complete-session] Could not parse trackable id; keys:",
        Object.keys(data as object)
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[PostNord complete-session]", err);
    return NextResponse.json(
      { error: "Failed to complete PostNord session" },
      { status: 500 }
    );
  }
}
