import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { triggerShipmentDispatchedEmail } from "@/lib/trigger-shipment-dispatched-email";

/**
 * POST /api/orders/[id]/send-shipment-email
 *
 * Sends the customer's "paketet är på väg" email on demand.
 *
 * This exists because there was no way to send it deliberately. The only two
 * triggers were automatic: the booking route fired it the moment a label was
 * created, and the order PATCH handler fired it from a heuristic
 * (`tracking present && status deliverable && (tracking changed || just became
 * deliverable)`). Booking a label is not the same as handing the parcel to
 * PostNord, so the automatic one has been removed — which would have left the
 * customer unreachable from the UI without this route.
 *
 * Delegates to product-service `/api/orders/:id/send-shipment-notification`,
 * which refuses when the order has no tracking id.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (!Number.isFinite(orderId) || orderId < 1) {
    return NextResponse.json({ error: "Ogiltigt order-ID" }, { status: 400 });
  }

  try {
    await triggerShipmentDispatchedEmail(orderId);
    console.log(`[send-shipment-email] sent for order ${orderId}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[send-shipment-email] failed:", err);
    return NextResponse.json(
      { error: "Kunde inte skicka leveransmejlet", details: message },
      { status: 502 },
    );
  }
}
