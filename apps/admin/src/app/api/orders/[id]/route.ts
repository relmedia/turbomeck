import { db } from "@repo/database";
import { orders, orderItems } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** GET /api/orders/[id] - Single order with items for detail page */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const orderId = parseInt(id, 10);
    if (isNaN(orderId)) {
      return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    const addressLine = [
      order.address,
      [order.postalCode, order.city].filter(Boolean).join(" "),
      order.country,
    ]
      .filter(Boolean)
      .join(", ");

    return NextResponse.json({
      id: String(order.id),
      orderId: order.id,
      orderNumber: order.orderNumber,
      placedDate: order.createdAt?.toISOString?.()?.slice(0, 10) ?? "",
      customerName: `${order.firstName} ${order.lastName}`.trim(),
      customerEmail: order.email,
      address: addressLine,
      phone: order.phone ?? undefined,
      paymentMethod: "Kort",
      paymentLast4: order.stripePaymentId ? "****" : "—",
      subtotal: Number(order.subtotal),
      shipping: Number(order.shippingCost),
      discount: Number(order.discount),
      total: Number(order.total),
      deliveryStatus: mapToDeliveryStatus(order.status),
      servicePointName: order.servicePointName ?? undefined,
      deliveryOption: order.deliveryOption ?? "servicepoint",
      postNordTrackingId: order.postNordTrackingId ?? undefined,
      items: items.map((i) => ({
        productName: i.productName,
        productImage: i.productImage ?? "/products/1g.png",
        variant: (i as { variant?: string }).variant ?? undefined,
        quantity: i.quantity,
        price: Number(i.price),
        total: Number(i.price) * i.quantity,
      })),
    });
  } catch (err) {
    console.error("Failed to fetch order:", err);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

function mapToDeliveryStatus(
  status: string | null
): "processing" | "shipped" | "out_for_delivery" | "delivered" {
  switch (status) {
    case "confirmed":
      return "processing";
    case "shipped":
      return "shipped";
    case "delivered":
      return "delivered";
    case "cancelled":
      return "processing";
    default:
      return "processing";
  }
}
