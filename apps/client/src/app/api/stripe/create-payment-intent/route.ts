import { NextRequest, NextResponse } from "next/server";
import {
  internalProductApiAuthHeaders,
  requireInternalProductApiSecret,
} from "@/lib/internal-product-api";

const PRODUCT_SERVICE =
  process.env.PRODUCT_SERVICE_URL ||
  process.env.NEXT_PUBLIC_PRODUCT_API_URL ||
  "http://localhost:8000";

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || "http://localhost:8002";

type CheckoutQuoteBody = {
  items: unknown[];
  couponCode?: string;
  country?: string;
  deliveryOption?: string;
  commitsCoreReturnWithin14?: boolean;
};

function isCheckoutQuoteBody(b: unknown): b is CheckoutQuoteBody {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return Array.isArray(o.items) && o.items.length > 0;
}

/**
 * POST /api/stripe/create-payment-intent
 * - Full checkout body: server quotes amount via product-service (do not trust client totals).
 * - Legacy: { amount: number } for balance payments (prefer migrating to order-scoped verification).
 */
export async function POST(request: NextRequest) {
  const paymentUrl = `${PAYMENT_SERVICE_URL.replace(/\/$/, "")}/create-payment-intent`;

  try {
    const body = await request.json();

    let amountSek: number;

    if (isCheckoutQuoteBody(body)) {
      requireInternalProductApiSecret();
      const quoteRes = await fetch(`${PRODUCT_SERVICE.replace(/\/$/, "")}/api/checkout-quote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...internalProductApiAuthHeaders(),
        },
        body: JSON.stringify({
          items: body.items,
          couponCode: body.couponCode,
          country: body.country,
          deliveryOption: body.deliveryOption,
          commitsCoreReturnWithin14: body.commitsCoreReturnWithin14,
        }),
      });
      const quoteData = (await quoteRes.json().catch(() => ({}))) as { error?: string; amount?: number };
      if (!quoteRes.ok) {
        return NextResponse.json(
          { error: quoteData.error ?? "Could not quote checkout" },
          { status: quoteRes.status },
        );
      }
      if (typeof quoteData.amount !== "number" || !Number.isFinite(quoteData.amount) || quoteData.amount <= 0) {
        return NextResponse.json({ error: "Invalid quote from checkout service" }, { status: 502 });
      }
      amountSek = quoteData.amount;
    } else {
      const raw = (body as { amount?: unknown }).amount;
      amountSek = typeof raw === "number" ? raw : parseFloat(String(raw ?? 0)) || 0;
      if (amountSek <= 0) {
        return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
      }
    }

    const res = await fetch(paymentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amountSek }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { error: (data as { error?: string }).error ?? "Payment service error" },
        { status: res.status },
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create payment intent";
    if (message.includes("INTERNAL_PRODUCT_API_SECRET")) {
      return NextResponse.json(
        {
          error:
            "Betalning är inte konfigurerad (INTERNAL_PRODUCT_API_SECRET). Kontakta administratören.",
        },
        { status: 503 },
      );
    }
    console.error("[stripe create-payment-intent]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
