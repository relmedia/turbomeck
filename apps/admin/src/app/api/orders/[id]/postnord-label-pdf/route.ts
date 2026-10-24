import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { orders } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { type PostNordLabelPrintSettings } from "@/lib/postnord-booking-edi";
import { fetchStoredLabelById } from "@/lib/postnord-label-reprint";

function safeFilenamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "order";
}

/**
 * GET /api/orders/[id]/postnord-label-pdf
 * Returns the shipping label PDF from PostNord Booking API (labels/pdf) using the
 * snapshot stored when the order was booked with PostNord.
 */
export async function GET(
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

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) {
    return NextResponse.json({ error: "Order hittades inte" }, { status: 404 });
  }

  /**
   * Serve the stored label. NEVER re-post the EDI instruction.
   *
   * `/v3/edi/labels/pdf` is book-and-print: every POST of the instruction
   * registers a new parcel. This route used to do exactly that on each click,
   * so printing a label silently booked another shipment — two identical calls
   * produced parcels 00573132902027512511 and 00573132902027512528, neither of
   * them the one the order was booked as. Booking now captures the label and
   * stores it, and this route only reads it back.
   *
   * Reprinting in a *different* paper size goes to `/v3/labels/ids/pdf`, which
   * prints an already-stored label by id and books nothing. It only works for
   * parcels booked with `storeLabel=true`, i.e. booked after this change.
   */
  const stored = order.postNordLabelPdf?.trim();
  if (!stored) {
    return NextResponse.json(
      {
        error:
          "Ingen sparad etikett för denna order. Etiketten sparas från och med att ordern bokas om — tidigare bokningar har ingen, eftersom varje hämtning då bokade ett nytt kolli.",
      },
      { status: 404 },
    );
  }

  const q = new URL(req.url).searchParams;
  const rotate = q.get("rotate");
  const requestedPaper = q.get("paperSize")?.trim() || undefined;
  const requestedType = q.get("labelType")?.trim() || undefined;
  const settings: PostNordLabelPrintSettings = {
    paperSize: requestedPaper,
    labelType: requestedType,
    rotate:
      rotate === "0" || rotate === "90" || rotate === "180" || rotate === "270"
        ? rotate
        : undefined,
  };

  /**
   * The stored label already matches what was asked for when no size is given,
   * or when the size matches the one it was rendered at. Anything else needs a
   * fresh render from PostNord — by id, so nothing is booked.
   */
  const storedPaper = order.postNordLabelPaperSize ?? null;
  const needsRerender =
    (requestedPaper != null && requestedPaper !== storedPaper) ||
    requestedType != null ||
    settings.rotate != null;

  let body: ArrayBuffer;
  let usedPaper = storedPaper;

  if (!needsRerender) {
    const buf = Buffer.from(stored, "base64");
    body = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
  } else {
    const trackingId = (order.postNordTrackingId ?? "").trim();
    if (!trackingId) {
      return NextResponse.json(
        {
          error:
            "Kan inte skriva om etiketten i ett annat format utan kollinummer. Använd det sparade formatet" +
            (storedPaper ? ` (${storedPaper}).` : "."),
        },
        { status: 409 },
      );
    }
    const reprint = await fetchStoredLabelById(trackingId, settings);
    if (!reprint.ok) {
      return NextResponse.json(
        { error: reprint.message, details: reprint.details },
        { status: reprint.status >= 400 && reprint.status < 600 ? reprint.status : 502 },
      );
    }
    body = reprint.body;
    usedPaper = settings.paperSize ?? storedPaper;
  }

  const base = safeFilenamePart(order.orderNumber ?? `order-${order.id}`);
  const sizePart = usedPaper ? `-${safeFilenamePart(usedPaper)}` : "";
  const filename = `${base}-fraktetikett${sizePart}.pdf`;

  /**
   * `?disposition=inline` is for the print dialog's preview, which renders the
   * PDF in an iframe — an attachment disposition would make the browser
   * download it instead of showing it. Printing keeps the default attachment.
   */
  const inline = q.get("disposition") === "inline";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
