import { NextRequest, NextResponse } from "next/server";
import {
  internalProductApiAuthHeaders,
  requireInternalProductApiSecret,
} from "@/lib/internal-product-api";

/**
 * POST /api/checkout/quote — server-priced cart totals, for display.
 *
 * The cart used to compute its own subtotal, shipping and discount in the
 * browser while product-service computed them again for the charge. Two
 * implementations of the same arithmetic drifted once already (the coupon was
 * missing from the redirect payload, so the displayed discount and the charged
 * amount disagreed), and multi-currency makes that split untenable: the
 * customer must see the figure they will actually be charged, in the currency
 * they will be charged in.
 *
 * So this proxies the same `/api/checkout-quote` the PaymentIntent is built
 * from. No session needed — it reveals nothing the shopper didn't submit — but
 * it does need the internal secret, which is why it goes through here rather
 * than being called from the browser.
 */

const PRODUCT_SERVICE =
  process.env.PRODUCT_SERVICE_URL ||
  process.env.NEXT_PUBLIC_PRODUCT_API_URL ||
  "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    requireInternalProductApiSecret();
  } catch {
    return NextResponse.json(
      { error: "Produkt-API är inte konfigurerat." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${PRODUCT_SERVICE.replace(/\/$/, "")}/api/checkout-quote`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...internalProductApiAuthHeaders(),
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[checkout/quote]", err);
    return NextResponse.json(
      { error: "Kunde inte beräkna summan just nu." },
      { status: 502 },
    );
  }
}
