import { NextRequest, NextResponse } from "next/server";
import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { orders } from "@repo/database/schema";
import { and, eq, or } from "drizzle-orm";
import { timingSafeEqual } from "crypto";

/**
 * Constant-time token comparison; mirrors `canAccessOrderViewToken` in product-service.
 * Both inputs must be non-empty strings of the same length to compare; otherwise false.
 */
function timingSafeTokenEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * GET /api/stripe/receipt-url?paymentIntentId=pi_xxx[&token=<order_view_token>]
 *
 * SECURITY: the underlying payment-service endpoint is open and would happily
 * return the Stripe-hosted receipt URL for any payment intent the caller can
 * name. This wrapper requires that the PI actually belong to:
 *   - the signed-in user (matching `orders.userId`), OR
 *   - a guest order whose view-token the caller supplied (`?token=...`).
 * Anything else returns 403.
 */
export async function GET(req: NextRequest) {
  const paymentIntentId = req.nextUrl.searchParams.get("paymentIntentId");
  const viewToken = req.nextUrl.searchParams.get("token");
  if (!paymentIntentId?.startsWith("pi_")) {
    return NextResponse.json({ error: "Invalid paymentIntentId", receiptUrl: null }, { status: 400 });
  }

  const session = await auth();
  const [order] = await db
    .select({
      userId: orders.userId,
      viewToken: orders.viewToken,
    })
    .from(orders)
    .where(
      or(
        eq(orders.stripePaymentId, paymentIntentId),
        eq(orders.stripeBalancePaymentId, paymentIntentId),
      ),
    )
    .limit(1);

  if (!order) {
    return NextResponse.json(
      { error: "Receipt not found", receiptUrl: null },
      { status: 404 },
    );
  }

  const ownsBySession =
    !!session?.user?.id && order.userId === session.user.id;
  const ownsByToken =
    !!order.viewToken && !!viewToken && timingSafeTokenEqual(viewToken, order.viewToken);
  if (!ownsBySession && !ownsByToken) {
    return NextResponse.json(
      { error: "Forbidden", receiptUrl: null },
      { status: 403 },
    );
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
