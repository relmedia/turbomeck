import { db } from "@repo/database";
import { orders, orderRefunds } from "@repo/database/schema";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { normalizeCurrency } from "@repo/currency";
import { requireAdmin } from "@/lib/require-admin";

/**
 * GET /api/refunds — every refund ever issued, newest first.
 *
 * Joined to `orders` for the customer's name and order number: a refund row on
 * its own says an amount and an id, which is no use to someone trying to work
 * out who got their money back.
 *
 * Reads our own rows rather than asking Stripe. This is history, and Stripe is
 * only consulted where correctness depends on it — the refundable figures on
 * the order page. A refund issued from the Stripe dashboard will therefore not
 * appear here; see the webhook note in order-refunds.ts.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const rows = await db
      .select({
        id: orderRefunds.id,
        orderId: orderRefunds.orderId,
        orderNumber: orders.orderNumber,
        firstName: orders.firstName,
        lastName: orders.lastName,
        email: orders.email,
        orderTotal: orders.total,
        orderStatus: orders.status,
        amount: orderRefunds.amount,
        currency: orderRefunds.currency,
        chargeKind: orderRefunds.chargeKind,
        status: orderRefunds.status,
        note: orderRefunds.note,
        failureReason: orderRefunds.stripeFailureReason,
        stripeRefundId: orderRefunds.stripeRefundId,
        performedBy: orderRefunds.performedBy,
        emailSentAt: orderRefunds.emailSentAt,
        createdAt: orderRefunds.createdAt,
      })
      .from(orderRefunds)
      .leftJoin(orders, eq(orderRefunds.orderId, orders.id))
      .orderBy(desc(orderRefunds.createdAt))
      .limit(500);

    const list = rows.map((r) => ({
      id: String(r.id),
      refundId: r.id,
      orderId: r.orderId,
      orderNumber: r.orderNumber ?? `#${r.orderId}`,
      customerName: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "—",
      email: r.email ?? "",
      // Decimal columns come back as strings; Number() at the boundary.
      amount: Number(r.amount),
      orderTotal: r.orderTotal != null ? Number(r.orderTotal) : null,
      currency: normalizeCurrency(r.currency),
      chargeKind: r.chargeKind,
      status: r.status,
      orderStatus: r.orderStatus ?? "",
      note: r.note,
      failureReason: r.failureReason,
      stripeRefundId: r.stripeRefundId,
      performedBy: r.performedBy,
      emailSent: r.emailSentAt != null,
      createdAt: r.createdAt?.toISOString() ?? null,
    }));

    return NextResponse.json(list);
  } catch (err) {
    console.error("Failed to fetch refunds:", err);
    return NextResponse.json({ error: "Kunde inte hämta återbetalningar" }, { status: 500 });
  }
}
