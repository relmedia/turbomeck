import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.POSTNORD_SHIPPING_API_URL;
const API_KEY = process.env.POSTNORD_SHIPPING_API_KEY;
const SITE_CODE = process.env.POSTNORD_SITE_CODE ?? "acmeSE";

/**
 * PUT /api/postnord/shipping/update-session/[sessionId]
 * Updates a PostNord Shipping Module session when address/cart changes.
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
    const body = await request.json();
    const { items = [], deliveryAddress = {}, userInputs = {} } = body;

    const payload = {
      purchaseId: body.purchaseId ?? `P${Date.now()}`,
      locale: body.locale ?? "sv-SE",
      mode: 0,
      checkoutSite: {
        siteCode: SITE_CODE,
        countryCode: deliveryAddress.country ?? "SE",
        currencyCode: "SEK",
      },
      items: items.map(
        (item: { name?: string; price?: number; quantity?: number; weight?: number }) => ({
          description: item.name ?? "Produkt",
          amount: Number(item.price ?? 0),
          quantity: Number(item.quantity ?? 1),
          shippingParameters: item.weight
            ? { width: null, height: null, length: null, weight: Number(item.weight), attributes: [] }
            : null,
        })
      ),
      shippingSettings: { vouchers: null, attributes: null },
      deliveryAddress: {
        address1: deliveryAddress.address ?? null,
        address2: null,
        street: deliveryAddress.address ?? null,
        zip: deliveryAddress.postalCode ?? deliveryAddress.zip ?? null,
        city: deliveryAddress.city ?? null,
        type: "Private",
        firstName: deliveryAddress.firstName ?? null,
        lastName: deliveryAddress.lastName ?? null,
        country: deliveryAddress.country ?? "SE",
      },
      userInputs: {
        email: userInputs.email ?? null,
        phoneCountryTwoLetterIso:
          (deliveryAddress.country ?? userInputs.phoneCountryTwoLetterIso) ?? "SE",
        phone: userInputs.phone ?? null,
      },
    };

    const res = await fetch(`${API_URL}/update-session/${sessionId}`, {
      method: "PUT",
      headers: {
        Authorization: API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[PostNord update-session]", res.status, text);
      return NextResponse.json(
        { error: "Failed to update PostNord session", details: text },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[PostNord update-session]", err);
    return NextResponse.json(
      { error: "Failed to update PostNord session" },
      { status: 500 }
    );
  }
}
