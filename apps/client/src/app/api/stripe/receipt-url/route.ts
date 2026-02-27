import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/stripe/receipt-url?paymentIntentId=pi_xxx
 * Proxies to payment-service for Stripe receipt URL.
 * Returns: { receiptUrl: string | null }
 */
export async function GET(req: NextRequest) {
  const paymentIntentId = req.nextUrl.searchParams.get("paymentIntentId");
  if (!paymentIntentId?.startsWith("pi_")) {
    return NextResponse.json({ error: "Invalid paymentIntentId", receiptUrl: null }, { status: 400 });
  }

  const baseUrl = process.env.PAYMENT_SERVICE_URL || "http://localhost:8002";
  const url = `${baseUrl.replace(/\/$/, "")}/receipt-url?paymentIntentId=${encodeURIComponent(paymentIntentId)}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? "Payment service error", receiptUrl: null },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load receipt";
    console.error("[stripe receipt-url]", err);
    return NextResponse.json({ error: message, receiptUrl: null }, { status: 500 });
  }
}
