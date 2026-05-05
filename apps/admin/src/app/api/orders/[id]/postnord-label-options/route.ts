import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { orders } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import {
  normalizePrintOptionsItems,
  postPostNordLabelPrintOptions,
  type PostNordLabelPrintOptionsRequestItem,
} from "@/lib/postnord-label-print-options";

/**
 * GET /api/orders/[id]/postnord-label-options
 *   ?format=PDF|ZPL  ?rotate=0|90|180|270  ?definePrintout=ALL|LABELSANDCUSTOMSDECLARATIONS
 *   ?ids=00373500489530470000,00464300432919841196   (optional override; defaults to the order’s tracking id)
 *
 * Returns:
 *   - `summaryPrintoutLabelOptions`: options that work for ALL ids passed
 *   - `printoutLabelOptions`: per-id options
 *
 * Use this in the admin order detail to populate “Etikettformat / pappersstorlek / rotation”
 * before requesting the actual PDF.
 */
export async function GET(
  req: NextRequest,
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

  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "PDF").toUpperCase();
  const rotate = url.searchParams.get("rotate") ?? "0";
  const definePrintout = (
    url.searchParams.get("definePrintout") ?? "ALL"
  ).toUpperCase();

  const idsParam = url.searchParams.get("ids");
  let rawIds: string[] = [];
  if (idsParam && idsParam.trim()) {
    rawIds = idsParam.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  } else {
    const tid = (order.postNordTrackingId ?? "").trim();
    if (tid) rawIds = [tid];
  }

  if (rawIds.length === 0) {
    return NextResponse.json(
      { error: "Saknar shipment-id. Boka frakt först eller skicka ?ids=..." },
      { status: 400 }
    );
  }

  const items: PostNordLabelPrintOptionsRequestItem[] = normalizePrintOptionsItems(rawIds, {
    format: format === "ZPL" ? "ZPL" : "PDF",
    rotate: rotate as "0" | "90" | "180" | "270",
    definePrintout:
      definePrintout === "LABELSANDCUSTOMSDECLARATIONS"
        ? "LABELSANDCUSTOMSDECLARATIONS"
        : "ALL",
  });

  const result = await postPostNordLabelPrintOptions(items);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, details: result.details },
      { status: result.status >= 400 && result.status < 600 ? result.status : 502 }
    );
  }

  return NextResponse.json({
    requestedIds: items.map((it) => it.id),
    options: result.data,
  });
}
