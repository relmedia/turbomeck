import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { orders, orderItems } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { triggerShipmentDispatchedEmail } from "@/lib/trigger-shipment-dispatched-email";

const VALID_STATUSES = ["confirmed", "deposit_paid", "shipped", "delivered", "cancelled", "completed"] as const;

/** PATCH /api/orders/[id] - Admin update order status and tracking */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const orderId = parseInt(id, 10);
    if (isNaN(orderId)) {
      return NextResponse.json({ error: "Ogiltigt order-ID" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const trackingKeyPresent = Object.prototype.hasOwnProperty.call(body, "postNordTrackingId");
    const { status, postNordTrackingId, coreReceived } = body as {
      status?: string;
      postNordTrackingId?: string;
      coreReceived?: boolean;
    };

    const updates: Partial<{
      status: string;
      postNordTrackingId: string | null;
      coreReceivedAt: Date;
    }> = {};
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
        return NextResponse.json(
          { error: "Ogiltig status. Använd: confirmed, shipped, delivered, cancelled" },
          { status: 400 }
        );
      }
      updates.status = status;
    }
    if (postNordTrackingId !== undefined) {
      updates.postNordTrackingId = postNordTrackingId === "" ? null : String(postNordTrackingId).trim() || null;
    }
    if (coreReceived === true) {
      updates.coreReceivedAt = new Date();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Inga fält att uppdatera" }, { status: 400 });
    }

    const [existing] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Order hittades inte" }, { status: 404 });
    }
    const prevTracking = (existing.postNordTrackingId ?? "").trim();

    const [updated] = await db
      .update(orders)
      .set(updates)
      .where(eq(orders.id, orderId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Order hittades inte" }, { status: 404 });
    }

    const newTracking = (updated.postNordTrackingId ?? "").trim();
    const prevStatus = (existing.status ?? "confirmed").trim().toLowerCase();
    const newStatus = (updated.status ?? prevStatus).trim().toLowerCase();
    const wasDeliverable = prevStatus === "shipped" || prevStatus === "delivered";
    const isDeliverable = newStatus === "shipped" || newStatus === "delivered";
    const becameDeliverable = isDeliverable && !wasDeliverable;
    const trackingChanged =
      trackingKeyPresent && !!newTracking && newTracking !== prevTracking;

    const shouldSendShipmentEmail =
      !!newTracking && isDeliverable && (trackingChanged || becameDeliverable);

    let shipmentEmailSent: boolean | null = null;
    let shipmentEmailError: string | null = null;
    if (shouldSendShipmentEmail) {
      try {
        await triggerShipmentDispatchedEmail(orderId);
        shipmentEmailSent = true;
        console.log(`[orders PATCH] shipment email triggered for order ${orderId}`);
      } catch (err) {
        shipmentEmailSent = false;
        shipmentEmailError = err instanceof Error ? err.message : String(err);
        console.error("[orders PATCH] shipment notification failed:", err);
      }
    }

    return NextResponse.json({
      success: true,
      shipmentEmailSent,
      shipmentEmailError,
    });
  } catch (err) {
    console.error("Failed to update order:", err);
    return NextResponse.json(
      { error: "Kunde inte uppdatera order" },
      { status: 500 }
    );
  }
}

/** DELETE /api/orders/[id] - Admin delete an order */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const orderId = parseInt(id, 10);
    if (isNaN(orderId)) {
      return NextResponse.json({ error: "Ogiltigt order-ID" }, { status: 400 });
    }

    const [deleted] = await db
      .delete(orders)
      .where(eq(orders.id, orderId))
      .returning({ id: orders.id });
    if (!deleted) {
      return NextResponse.json({ error: "Order hittades inte" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete order:", err);
    return NextResponse.json({ error: "Kunde inte ta bort order" }, { status: 500 });
  }
}

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

    let paymentLast4 = "—";
    if (order.stripePaymentId?.startsWith("pi_")) {
      const baseUrl = process.env.PAYMENT_SERVICE_URL || "http://localhost:8002";
      try {
        const res = await fetch(
          `${baseUrl.replace(/\/$/, "")}/payment-method-details?paymentIntentId=${encodeURIComponent(order.stripePaymentId)}`,
          { cache: "no-store" }
        );
        const data = (await res.json().catch(() => ({}))) as { last4?: string };
        paymentLast4 = data?.last4 ?? "****";
      } catch {
        paymentLast4 = "****";
      }
    }

    return NextResponse.json({
      id: String(order.id),
      orderId: order.id,
      viewToken: order.viewToken ?? null,
      orderNumber: order.orderNumber,
      placedDate: order.createdAt?.toISOString?.()?.slice(0, 10) ?? "",
      customerName: `${order.firstName} ${order.lastName}`.trim(),
      firstName: order.firstName,
      lastName: order.lastName,
      customerEmail: order.email,
      address: addressLine,
      addressStreet: order.address,
      postalCode: order.postalCode,
      city: order.city,
      country: order.country ?? "SE",
      phone: order.phone ?? undefined,
      paymentMethod: "Kort",
      paymentLast4,
      subtotal: Number(order.subtotal),
      shipping: Number(order.shippingCost),
      discount: Number(order.discount),
      total: Number(order.total),
      depositAmount:
        order.depositAmount != null ? Number(order.depositAmount) : undefined,
      balanceDue: order.balanceDue != null ? Number(order.balanceDue) : undefined,
      commitsCoreReturnWithin14: order.commitsCoreReturnWithin14 ?? null,
      coreKeepFeeSek: order.coreKeepFeeSek ?? 0,
      coreReturnDeadline: order.coreReturnDeadline?.toISOString?.() ?? null,
      coreReceivedAt: order.coreReceivedAt?.toISOString?.() ?? null,
      status: order.status ?? "confirmed",
      deliveryStatus: mapToDeliveryStatus(order.status),
      servicePointName: order.servicePointName ?? undefined,
      servicePointId: order.servicePointId ?? undefined,
      deliveryOption: order.deliveryOption ?? "servicepoint",
      postNordTrackingId: order.postNordTrackingId ?? undefined,
      hasPostNordLabel:
        order.postNordLabelSnapshot != null &&
        typeof order.postNordLabelSnapshot === "object" &&
        !Array.isArray(order.postNordLabelSnapshot),
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
    case "deposit_paid":
      return "processing";
    case "shipped":
      return "shipped";
    case "delivered":
    case "completed":
      return "delivered";
    case "cancelled":
      return "processing";
    default:
      return "processing";
  }
}
