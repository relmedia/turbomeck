import { db } from "@repo/database";
import { orders, orderItems } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { normalizeCurrency } from "@repo/currency";
import { NextResponse } from "next/server";
import { triggerShipmentDispatchedEmail } from "@/lib/trigger-shipment-dispatched-email";
import { requireAdmin } from "@/lib/require-admin";

const VALID_STATUSES = [
  "confirmed",
  "shipped",
  "delivered",
  /** Came back to us: PostNord returned it, usually uncollected. */
  "returned",
  "cancelled",
  "completed",
  /** Money partly returned. The order still stands; the refund rows say how much. */
  "partially_refunded",
  /** Nothing left refundable on any charge. */
  "refunded",
] as const;

/** PATCH /api/orders/[id] - Admin update order status and tracking */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

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
          { error: `Ogiltig status. Använd: ${VALID_STATUSES.join(", ")}` },
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
        /**
         * No `force`: this is a heuristic firing off a status edit, not an
         * explicit request to mail the customer. The shipping poller now sends
         * the same mail when PostNord reports EN_ROUTE, so without deferring to
         * the ledger a staff member setting the status to "shipped" shortly
         * after the parcel was scanned would send a second copy.
         */
        const outcome = await triggerShipmentDispatchedEmail(orderId);
        shipmentEmailSent = outcome.sent;
        console.log(
          outcome.sent
            ? `[orders PATCH] shipment email triggered for order ${orderId}`
            : `[orders PATCH] shipment email already recorded for order ${orderId}; not resending`,
        );
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
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { session } = gate;

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
    // Log ids only — orderNumber and admin email are PII-adjacent and bloat
    // log lines for log aggregators.
    console.log(
      `[orders DELETE] order ${deleted.id} deleted by admin ${session.user.id}`,
    );
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
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
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

    // "—" means "nothing to show" and the payments view hides the card line
    // entirely. We used to fall back to "****" on failure, which rendered as
    // "•••• ****" — indistinguishable from a real card, so a misconfigured
    // PAYMENT_SERVICE_URL looked like a card with no digits on file instead of
    // a broken fetch. Failures now stay "—" and get logged.
    let paymentLast4 = "—";
    if (order.stripePaymentId?.startsWith("pi_")) {
      const baseUrl = process.env.PAYMENT_SERVICE_URL || "http://localhost:8002";
      try {
        const res = await fetch(
          `${baseUrl.replace(/\/$/, "")}/payment-method-details?paymentIntentId=${encodeURIComponent(order.stripePaymentId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          // A public-domain PAYMENT_SERVICE_URL answers with the storefront's
          // 404 HTML rather than JSON — point at the internal port instead.
          console.error(
            `[orders GET] payment-method-details ${res.status} from ${baseUrl} — expected the payment service on http://127.0.0.1:8002`
          );
        } else {
          const data = (await res.json().catch(() => ({}))) as {
            last4?: string | null;
          };
          if (data?.last4) paymentLast4 = String(data.last4);
        }
      } catch (err) {
        console.error(
          `[orders GET] payment-method-details unreachable at ${baseUrl}:`,
          err
        );
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
      // The currency the order was charged in. Staff reconcile these figures
      // against Stripe, so an EUR order must not be shown as kronor.
      currency: normalizeCurrency(
        (order as { currency?: string | null }).currency,
      ),
      /**
       * VAT as it was charged, read from the order rather than recomputed.
       * The summary used to derive it as `(subtotal + shipping) * 0.2`, which
       * invents Swedish VAT on an export to outside the EU.
       */
      vatTreatment: (order as { vatTreatment?: string | null }).vatTreatment ?? null,
      vatRate:
        (order as { vatRate?: string | null }).vatRate != null
          ? Number((order as { vatRate?: string | null }).vatRate)
          : null,
      vatAmount:
        (order as { vatAmount?: string | null }).vatAmount != null
          ? Number((order as { vatAmount?: string | null }).vatAmount)
          : null,
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
    // Legacy: older orders may still carry "deposit_paid"; map it to processing.
    case "deposit_paid":
      return "processing";
    case "shipped":
      return "shipped";
    case "delivered":
    case "completed":
      return "delivered";
    case "cancelled":
    // No refunded step exists in DELIVERY_STEPS, so these have to map to
    // something. "processing" is the inert choice, and the order page does not
    // render the stepper for a fully refunded order anyway — it shows an
    // "Återbetald" panel instead, so this value is never drawn for one.
    case "partially_refunded":
    case "refunded":
      return "processing";
    default:
      return "processing";
  }
}
