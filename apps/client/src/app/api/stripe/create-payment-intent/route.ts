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

type BalancePaymentBody = {
  orderId: number;
  orderToken?: string;
};

function isCheckoutQuoteBody(b: unknown): b is CheckoutQuoteBody {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return Array.isArray(o.items) && o.items.length > 0;
}

function isBalancePaymentBody(b: unknown): b is BalancePaymentBody {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return typeof o.orderId === "number" && Number.isFinite(o.orderId) && o.orderId > 0;
}

/**
 * POST /api/stripe/create-payment-intent
 *
 * The route NEVER trusts a client-supplied amount. Two server-quoted paths:
 *
 * - **Full checkout** (`{ items, couponCode, country, deliveryOption, ... }`):
 *   amount is quoted via product-service `/api/checkout-quote`.
 * - **Order balance** (`{ orderId, orderToken? }`): amount is fetched from
 *   product-service `/api/orders/:id/balance`, which itself enforces a
 *   viewToken-based access check on guest orders.
 *
 * The previous `{ amount: number }` shape was removed — it let any caller
 * specify an arbitrary positive amount for Stripe to charge.
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
    } else if (isBalancePaymentBody(body)) {
      requireInternalProductApiSecret();
      const balanceQuery = body.orderToken
        ? `?token=${encodeURIComponent(body.orderToken)}`
        : "";
      const balanceRes = await fetch(
        `${PRODUCT_SERVICE.replace(/\/$/, "")}/api/orders/${encodeURIComponent(String(body.orderId))}/balance${balanceQuery}`,
        {
          method: "GET",
          headers: { ...internalProductApiAuthHeaders() },
          cache: "no-store",
        },
      );
      const balanceData = (await balanceRes.json().catch(() => ({}))) as {
        error?: string;
        balanceDue?: number;
      };
      if (!balanceRes.ok) {
        return NextResponse.json(
          { error: balanceData.error ?? "Could not fetch order balance" },
          { status: balanceRes.status },
        );
      }
      if (
        typeof balanceData.balanceDue !== "number" ||
        !Number.isFinite(balanceData.balanceDue) ||
        balanceData.balanceDue <= 0
      ) {
        return NextResponse.json(
          { error: "Invalid order balance" },
          { status: 400 },
        );
      }
      amountSek = balanceData.balanceDue;
    } else {
      return NextResponse.json(
        { error: "Invalid payment request" },
        { status: 400 },
      );
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
