import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { orders } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  buildEdiInstructionForLabelPdf,
  buildEdiInstructionToServicePoint,
  isPostNordEdiDestinationCountry,
  postEdiBooking,
} from "@/lib/postnord-booking-edi";
import { triggerShipmentDispatchedEmail } from "@/lib/trigger-shipment-dispatched-email";

/**
 * POST /api/orders/[id]/postnord-book-shipment
 * Books parcel to customer’s service point via PostNord Booking API.
 * Stores merged instruction + idInformation for GET …/postnord-label-pdf (label PDF).
 * Requires POSTNORD_API_KEY; IAM/OAuth per PostNord; product codes from your agreement (.env.example).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (!Number.isFinite(orderId) || orderId < 1) {
    return NextResponse.json({ error: "Ogiltigt order-ID" }, { status: 400 });
  }

  let body: { weightKg?: number; replaceExisting?: boolean } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }
  const weightKg =
    typeof body.weightKg === "number" && Number.isFinite(body.weightKg)
      ? body.weightKg
      : 3;
  const replaceExisting = body.replaceExisting === true;

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) {
    return NextResponse.json({ error: "Order hittades inte" }, { status: 404 });
  }

  const st = (order.status ?? "").toLowerCase();
  if (st === "cancelled") {
    return NextResponse.json({ error: "Kan inte boka frakt för avbruten order" }, { status: 400 });
  }

  const existingT = (order.postNordTrackingId ?? "").trim();
  if (existingT && !replaceExisting) {
    return NextResponse.json(
      {
        error: "Ordern har redan ett spårningsnummer. Sätt replaceExisting: true om du ska boka om.",
        postNordTrackingId: existingT,
      },
      { status: 409 }
    );
  }

  const country = (order.country ?? "SE").toUpperCase();
  if (!isPostNordEdiDestinationCountry(country)) {
    return NextResponse.json(
      {
        error:
          "PostNord ombudsfrakt är inte aktiverad för detta land. Länder styrs med POSTNORD_EDI_DESTINATION_COUNTRIES (standard SE, NO, DK).",
      },
      { status: 400 }
    );
  }

  const delivery = (order.deliveryOption ?? "servicepoint").toLowerCase();
  if (delivery !== "servicepoint") {
    return NextResponse.json(
      { error: "Nuvarande implementation: endast leverans till ombud (servicepoint)." },
      { status: 400 }
    );
  }

  const spid = (order.servicePointId ?? "").trim();
  if (!spid) {
    return NextResponse.json(
      { error: "Ordern saknar servicePointId (ombud). Kunden måste ha valt ombud i kassan." },
      { status: 400 }
    );
  }

  let shipmentInformation: ReturnType<typeof buildEdiInstructionToServicePoint>;
  try {
    shipmentInformation = buildEdiInstructionToServicePoint({
      orderReference: order.orderNumber ?? `ORD-${order.id}`,
      consigneeFirstName: order.firstName,
      consigneeLastName: order.lastName,
      consigneeStreet: order.address,
      consigneePostalCode: order.postalCode,
      consigneeCity: order.city,
      consigneeCountry: country,
      consigneePhone: order.phone,
      consigneeEmail: order.email,
      servicePointId: spid,
      servicePointName: order.servicePointName,
      weightKg,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Konfigurationsfel";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const booked = await postEdiBooking(shipmentInformation);
  if (!booked.ok) {
    return NextResponse.json(
      {
        error: booked.message,
        details: booked.details,
      },
      { status: booked.status >= 400 && booked.status < 600 ? booked.status : 502 }
    );
  }

  const labelSnapshot = buildEdiInstructionForLabelPdf(shipmentInformation, booked.rawBookingJson);

  await db
    .update(orders)
    .set({
      postNordTrackingId: booked.trackableId,
      status: "shipped",
      postNordLabelSnapshot: labelSnapshot ?? null,
    })
    .where(eq(orders.id, orderId));

  let shipmentEmailSent = false;
  let shipmentEmailError: string | null = null;
  try {
    await triggerShipmentDispatchedEmail(orderId);
    shipmentEmailSent = true;
  } catch (err) {
    shipmentEmailError = err instanceof Error ? err.message : String(err);
    console.error("[postnord-book-shipment] shipment email:", err);
  }

  return NextResponse.json({
    success: true,
    postNordTrackingId: booked.trackableId,
    postNordPrintId: booked.printId,
    postNordLabelAvailable: labelSnapshot != null,
    weightKg,
    shipmentEmailSent,
    shipmentEmailError,
  });
}
