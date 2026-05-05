import { NextRequest, NextResponse } from "next/server";
import { buildPostNordSessionBody } from "@/lib/postnord-session-payload";

const API_URL = process.env.POSTNORD_SHIPPING_API_URL;
const API_KEY = process.env.POSTNORD_SHIPPING_API_KEY;

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
    const payload = buildPostNordSessionBody(body, "create");

    const res = await fetch(`${API_URL.replace(/\/+$/, "")}/create-session`, {
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
