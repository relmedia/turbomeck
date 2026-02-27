import { NextResponse } from "next/server";

/**
 * GET /api/stripe/config
 * Proxies to payment-service for Stripe publishable key.
 * Returns: { publishableKey: string }
 */
export async function GET() {
  const baseUrl = process.env.PAYMENT_SERVICE_URL || "http://localhost:8002";
  const url = `${baseUrl.replace(/\/$/, "")}/stripe-config`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? "Payment service error" },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load Stripe config";
    console.error("[stripe config]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
