import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/stripe/create-payment-intent
 * Proxies to payment-service. Body: { amount: number } - total in SEK
 * Returns: { clientSecret: string, paymentIntentId: string }
 */
export async function POST(request: NextRequest) {
  const baseUrl = process.env.PAYMENT_SERVICE_URL || "http://localhost:8002";
  const url = `${baseUrl.replace(/\/$/, "")}/create-payment-intent`;

  try {
    const body = await request.json();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? "Payment service error" },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create payment intent";
    console.error("[stripe create-payment-intent]", err);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
