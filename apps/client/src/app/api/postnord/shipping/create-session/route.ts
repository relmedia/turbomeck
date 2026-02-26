import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.POSTNORD_SHIPPING_API_URL;
const API_KEY = process.env.POSTNORD_SHIPPING_API_KEY;
const SITE_CODE = process.env.POSTNORD_SITE_CODE ?? "acmeSE";

/**
 * POST /api/postnord/shipping/create-session
 * Creates a PostNord Shipping Module session.
 * @see https://devportal.postnord.com/pn-shipping-module/v1/index.html
 */
export async function POST(request: NextRequest) {
  if (!API_URL || !API_KEY) {
    return NextResponse.json(
      {
        error: "PostNord Shipping Module not configured. Set POSTNORD_SHIPPING_API_URL and POSTNORD_SHIPPING_API_KEY.",
      },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const {
      purchaseId = `P${Date.now()}`,
      items = [],
      deliveryAddress = {},
      userInputs = {},
      language = "sv-SE",
    } = body;

    const payload = {
      purchaseId,
      language: language.startsWith("sv") ? "sv-SE" : "en-US",
      checkoutSite: {
        siteCode: SITE_CODE,
        countryCode: deliveryAddress.country ?? "SE",
        currencyCode: "SEK",
      },
      mode: 1,
      items: items.map(
        (item: { name?: string; price?: number; quantity?: number; weight?: number }) => ({
          description: item.name ?? "Produkt",
          amount: Number(item.price ?? 0),
          quantity: Number(item.quantity ?? 1),
          shippingParameters: item.weight
            ? {
                width: null,
                height: null,
                length: null,
                weight: Number(item.weight),
                attributes: [],
              }
            : null,
        })
      ),
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

    const res = await fetch(`${API_URL}/create-session`, {
      method: "POST",
      headers: {
        Authorization: API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[PostNord create-session]", res.status, text);
      return NextResponse.json(
        { error: "Failed to create PostNord session", details: text },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      sessionId: data.id ?? data.sessionId,
      sessionToken: data.sessionToken ?? data.authKey ?? data.authorization,
    });
  } catch (err) {
    console.error("[PostNord create-session]", err);
    return NextResponse.json(
      { error: "Failed to create PostNord session" },
      { status: 500 }
    );
  }
}
