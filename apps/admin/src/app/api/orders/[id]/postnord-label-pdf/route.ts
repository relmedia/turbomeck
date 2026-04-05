import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { orders } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { postEdiLabelPdf } from "@/lib/postnord-booking-edi";

function safeFilenamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "order";
}

/**
 * GET /api/orders/[id]/postnord-label-pdf
 * Returns the shipping label PDF from PostNord Booking API (labels/pdf) using the
 * snapshot stored when the order was booked via EDI.
 */
export async function GET(
  _req: Request,
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

  const snap = order.postNordLabelSnapshot;
  if (snap == null || typeof snap !== "object" || Array.isArray(snap)) {
    return NextResponse.json(
      {
        error:
          "Ingen etikett-data för denna order. Boka frakt med PostNord (EDI) igen, eller ordern skapades innan etikettlagring aktiverades.",
      },
      { status: 404 }
    );
  }

  const pdf = await postEdiLabelPdf(snap as Record<string, unknown>);
  if (!pdf.ok) {
    return NextResponse.json(
      {
        error: pdf.message,
        details: pdf.details,
      },
      { status: pdf.status >= 400 && pdf.status < 600 ? pdf.status : 502 }
    );
  }

  const base = safeFilenamePart(order.orderNumber ?? `order-${order.id}`);
  const filename = `${base}-fraktetikett.pdf`;

  return new NextResponse(pdf.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
