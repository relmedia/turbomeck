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
import { extractPostNordPrintId } from "@/lib/postnord-shipment-response-id";
import { getPostNordBookingConfigStatus } from "@/lib/postnord-config-status";
import { getOrderParcelEstimate } from "@/lib/order-parcel-estimate";
import { notifyShipmentBooked } from "@/lib/trigger-admin-notification";
import { requireAdmin } from "@/lib/require-admin";

/**
 * PostNord service-point booking for one order.
 *
 * GET  — preflight: may this order be booked, is PostNord configured, what
 *        should the weight be, and what is already booked. Pure reads.
 * POST — books the parcel.
 *
 * Both handlers share `checkBookingEligibility` on purpose: a GET that says
 * "eligible" while the POST rejects with 400 would be a new class of bug, and
 * the two drifting apart is exactly how the old client-side country mirror
 * went wrong.
 */

type OrderRow = typeof orders.$inferSelect;

type Ineligible = {
  code:
    | "cancelled"
    | "refunded"
    | "country"
    | "home_delivery"
    | "no_service_point"
    | "no_service_point_address";
  /** Swedish, shown verbatim in the admin. */
  message: string;
};

function checkBookingEligibility(order: OrderRow): Ineligible | null {
  const status = (order.status ?? "").toLowerCase();
  if (status === "cancelled") {
    return { code: "cancelled", message: "Ordern är avbruten — ingen frakt kan bokas." };
  }
  // Buying a label for a parcel whose money has gone back is a straight loss.
  if (status === "refunded" || status === "partially_refunded") {
    return {
      code: "refunded",
      message: "Ordern är återbetald — ingen frakt kan bokas.",
    };
  }

  const country = (order.country ?? "SE").toUpperCase();
  if (!isPostNordEdiDestinationCountry(country)) {
    const allowed = getPostNordBookingConfigStatus().destinationCountries.join(", ");
    return {
      code: "country",
      message: `Land ${country} ingår inte i de tillåtna länderna (${allowed}). Styrs av POSTNORD_EDI_DESTINATION_COUNTRIES.`,
    };
  }

  if ((order.deliveryOption ?? "servicepoint").toLowerCase() !== "servicepoint") {
    return {
      code: "home_delivery",
      message: "Hemleverans — bokning stöds just nu endast för leverans till ombud.",
    };
  }

  if (!(order.servicePointId ?? "").trim()) {
    return {
      code: "no_service_point",
      message: "Ordern saknar ombuds-ID — kunden valde inget ombud i kassan.",
    };
  }

  /**
   * PostNord rejects a booking whose deliveryParty has no address
   * ("address is a required field", subType ADDRESS), and the address cannot
   * be fetched at booking time: every by-id service point endpoint answers
   * 410 Gone. Orders created before the address was stored therefore cannot be
   * booked, and saying so here beats letting PostNord answer with a fault the
   * admin has no way to act on.
   */
  if (
    !(order.servicePointStreet ?? "").trim() ||
    !(order.servicePointPostalCode ?? "").trim() ||
    !(order.servicePointCity ?? "").trim()
  ) {
    return {
      code: "no_service_point_address",
      message:
        "Ordern saknar ombudets adress, som PostNord kräver vid bokning. Adressen sparas först från och med att ombudet väljs i nya ordrar — äldre ordrar går inte att boka. Skapa en ny order via Lägg till order.",
    };
  }

  return null;
}

/** What the admin needs to render the booked state, all derived from the snapshot. */
function describeBooking(order: OrderRow) {
  const snapshot =
    order.postNordLabelSnapshot != null &&
    typeof order.postNordLabelSnapshot === "object" &&
    !Array.isArray(order.postNordLabelSnapshot)
      ? (order.postNordLabelSnapshot as Record<string, unknown>)
      : null;

  const shipment = Array.isArray(snapshot?.shipment)
    ? (snapshot!.shipment[0] as Record<string, unknown> | undefined)
    : undefined;
  const grossWeight = (shipment?.totalGrossWeight ?? null) as { value?: unknown } | null;
  const weightValue = typeof grossWeight?.value === "number" ? grossWeight.value : null;

  const trackingId = (order.postNordTrackingId ?? "").trim();
  /**
   * A cancelled booking is not "booked". PostNord has no cancel API, so this
   * flag is set by staff after cancelling in PostNord's portal — without it
   * admin kept claiming "Frakt bokad" for parcels that were already Avbruten
   * there. The tracking id and label stay as history of a parcel that existed.
   */
  const cancelledAt = order.postNordBookingCancelledAt ?? null;

  return {
    isBooked: (trackingId !== "" || snapshot != null) && cancelledAt == null,
    cancelledAt: cancelledAt ? cancelledAt.toISOString() : null,
    trackingId: trackingId || null,
    printId: snapshot ? extractPostNordPrintId(snapshot) : null,
    // The stored PDF is what makes a label printable; a snapshot alone is a
    // booking made before labels were stored and can no longer be printed.
    hasLabel: (order.postNordLabelPdf ?? "").trim() !== "",
    labelPaperSize: order.postNordLabelPaperSize ?? null,
    bookedAt: typeof snapshot?.messageDate === "string" ? snapshot.messageDate : null,
    /** A booking made against the test API must never look like a real parcel. */
    testBooking: snapshot?.testIndicator === true,
    weightKg: weightValue,
  };
}

async function loadOrder(id: string): Promise<OrderRow | null> {
  const orderId = parseInt(id, 10);
  if (!Number.isFinite(orderId) || orderId < 1) return null;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return order ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const { id } = await params;
    const order = await loadOrder(id);
    if (!order) return NextResponse.json({ error: "Order hittades inte" }, { status: 404 });

    const ineligibleReason = checkBookingEligibility(order);
    const estimate = await getOrderParcelEstimate(order.id);

    return NextResponse.json({
      eligible: ineligibleReason === null,
      ineligibleReason,
      booked: describeBooking(order),
      weight: {
        suggestedKg: estimate.weightKg,
        source: estimate.source,
        oversize: estimate.oversize,
        missingWeights: estimate.missingWeights,
      },
      config: getPostNordBookingConfigStatus(),
    });
  } catch (err) {
    console.error("[postnord-book-shipment] preflight failed:", err);
    return NextResponse.json(
      { error: "Kunde inte läsa fraktstatus", details: String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  // One outer try/catch: without it an unexpected throw became Next's HTML 500,
  // the client's res.json() blew up, and the admin saw only "Bokning misslyckades".
  try {
    const { id } = await params;
    const order = await loadOrder(id);
    if (!order) return NextResponse.json({ error: "Order hittades inte" }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as {
      weightKg?: number;
      replaceExisting?: boolean;
      /** Test-mode escape hatch: book despite missing config, to see the real error. */
      allowUnconfigured?: boolean;
    };

    const config = getPostNordBookingConfigStatus();
    const diagnostics = {
      host: config.host,
      mode: config.mode,
      testIndicator: config.testIndicator,
      oauth: config.oauth,
      missingConfig: config.blocking.map((c) => c.key),
    };

    const ineligible = checkBookingEligibility(order);
    if (ineligible) {
      return NextResponse.json({ error: ineligible.message, diagnostics }, { status: 400 });
    }

    const existingTracking = (order.postNordTrackingId ?? "").trim();
    if (existingTracking && body.replaceExisting !== true) {
      return NextResponse.json(
        {
          error:
            "Ordern har redan ett spårningsnummer. Använd ”Boka om” om du ska ersätta bokningen.",
          postNordTrackingId: existingTracking,
          diagnostics,
        },
        { status: 409 },
      );
    }

    // Refuse before touching the network when the agreement-specific variables
    // are missing — a PostNord 400 tells the operator nothing, this names the
    // exact variables to fill in. Overridable in test mode only.
    if (!config.ready && !(body.allowUnconfigured === true && config.mode === "test")) {
      return NextResponse.json(
        {
          error: "PostNord är inte konfigurerat — bokning avstängd.",
          details: `Saknar: ${config.blocking.map((c) => c.key).join(", ")}`,
          diagnostics,
        },
        { status: 409 },
      );
    }

    // Weight: an explicit value is validated rather than silently clamped — a
    // typed "35" meant as "3.5" should be questioned, and "0" must never
    // quietly become 3 kg as it used to.
    let weightKg: number;
    if (body.weightKg !== undefined) {
      const w = Number(body.weightKg);
      if (!Number.isFinite(w) || w < 0.1 || w > 35) {
        return NextResponse.json(
          { error: "Ogiltig vikt. Ange mellan 0,1 och 35 kg.", diagnostics },
          { status: 400 },
        );
      }
      weightKg = w;
    } else {
      weightKg = (await getOrderParcelEstimate(order.id)).weightKg;
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
        consigneeCountry: (order.country ?? "SE").toUpperCase(),
        consigneePhone: order.phone,
        consigneeEmail: order.email,
        servicePointId: (order.servicePointId ?? "").trim(),
        servicePointName: order.servicePointName,
        servicePointStreet: order.servicePointStreet,
        servicePointPostalCode: order.servicePointPostalCode,
        servicePointCity: order.servicePointCity,
        servicePointCountryCode: order.servicePointCountryCode,
        weightKg,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Konfigurationsfel";
      console.error("[postnord-book-shipment] could not build EDI instruction:", msg);
      return NextResponse.json({ error: msg, diagnostics }, { status: 400 });
    }

    const booked = await postEdiBooking(shipmentInformation);
    if (!booked.ok) {
      return NextResponse.json(
        { error: booked.message, details: booked.details, diagnostics },
        { status: booked.status >= 400 && booked.status < 600 ? booked.status : 502 },
      );
    }

    const labelSnapshot = buildEdiInstructionForLabelPdf(shipmentInformation, booked.rawBookingJson);

    // NOTE: status is deliberately NOT set to "shipped" here. Booking a label
    // is not the same as handing the parcel over, and "shipped" is visible to
    // the customer. It also keeps the PATCH handler's shipment-email trigger
    // alive — writing both tracking and status here made `becameDeliverable`
    // and `trackingChanged` false forever after, so the customer could never
    // be notified again.
    await db
      .update(orders)
      .set({
        postNordTrackingId: booked.trackableId,
        postNordLabelSnapshot: labelSnapshot ?? null,
        // The label from this same call. Stored now because asking for it
        // again would book another parcel.
        postNordLabelPdf: booked.labelPdfBase64,
        postNordLabelPaperSize: booked.labelPaperSize,
        // A fresh booking supersedes any earlier cancellation.
        postNordBookingCancelledAt: null,
      })
      .where(eq(orders.id, order.id));

    void notifyShipmentBooked({
      orderId: order.id,
      orderNumber: order.orderNumber ?? `ORD-${order.id}`,
      trackingId: booked.trackableId ?? "(saknas)",
      customerName: `${order.firstName ?? ""} ${order.lastName ?? ""}`.trim() || "—",
      customerEmail: order.email ?? null,
      servicePointName: order.servicePointName ?? null,
      weightKg,
      performedBy: gate.session.user.email ?? gate.session.user.id ?? null,
    });

    return NextResponse.json({
      success: true,
      postNordTrackingId: booked.trackableId,
      /** PostNord accepted it but returned no id — the parcel still exists. */
      needsManualId: booked.needsManualId,
      postNordPrintId: booked.printId,
      /**
       * Whether a label can actually be printed, which now means "we stored
       * the PDF". It used to mean "a snapshot exists", from when printing
       * re-posted that snapshot and booked another parcel each time.
       */
      postNordLabelAvailable: booked.labelPdfBase64 != null,
      weightKg,
      testBooking: config.testIndicator,
    });
  } catch (err) {
    console.error("[postnord-book-shipment] unexpected failure:", err);
    return NextResponse.json(
      { error: "Oväntat fel vid bokning", details: String(err) },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/orders/[id]/postnord-book-shipment
 *
 * Marks the PostNord booking cancelled, or undoes that mark.
 * Body: `{ cancelled: boolean }`.
 *
 * This records a cancellation; it does not perform one. PostNord exposes no
 * cancellation endpoint — the delete operation is absent from the Booking API
 * specification, and `updateIndicator: "Deletion"` is ignored and books a new
 * shipment instead — so the parcel has to be cancelled in PostNord's portal and
 * this is how admin is told that happened.
 *
 * The tracking id, snapshot and label are left untouched. A cancelled parcel
 * still existed and may already have been printed or billed, and throwing that
 * away would leave no trace of it.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const order = await loadOrder(id);
  if (!order) {
    return NextResponse.json({ error: "Order hittades inte" }, { status: 404 });
  }

  let cancelled: boolean;
  try {
    const body = (await req.json()) as { cancelled?: unknown };
    if (typeof body.cancelled !== "boolean") {
      return NextResponse.json(
        { error: "Fältet 'cancelled' måste vara true eller false." },
        { status: 400 },
      );
    }
    cancelled = body.cancelled;
  } catch {
    return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });
  }

  const hasBooking =
    (order.postNordTrackingId ?? "").trim() !== "" || order.postNordLabelSnapshot != null;
  if (cancelled && !hasBooking) {
    return NextResponse.json(
      { error: "Ordern har ingen bokning att avboka." },
      { status: 409 },
    );
  }

  await db
    .update(orders)
    .set({ postNordBookingCancelledAt: cancelled ? new Date() : null })
    .where(eq(orders.id, order.id));

  const updated = await loadOrder(id);
  return NextResponse.json({
    ok: true,
    booked: updated ? describeBooking(updated) : null,
  });
}
