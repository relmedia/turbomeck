import { db } from "@repo/database";
import { discountCodes } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

/** PATCH /api/coupons/[id] - Update discount code */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  try {
    const { id } = await params;
    const couponId = parseInt(id, 10);
    if (isNaN(couponId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.code !== undefined) {
      updates.code = String(body.code).trim().toUpperCase();
      if (!updates.code) {
        return NextResponse.json({ error: "Kod kan inte vara tom" }, { status: 400 });
      }
    }
    if (body.discountType !== undefined) {
      if (!["percent", "fixed"].includes(body.discountType)) {
        return NextResponse.json(
          { error: "discountType måste vara percent eller fixed" },
          { status: 400 }
        );
      }
      updates.discountType = body.discountType;
    }
    if (body.discountValue !== undefined) {
      const v = parseFloat(String(body.discountValue)) || 0;
      if (v <= 0) {
        return NextResponse.json(
          { error: "Rabattvärde måste vara större än 0" },
          { status: 400 }
        );
      }
      if (body.discountType === "percent" && v > 100) {
        return NextResponse.json(
          { error: "Procentrabatt kan inte överstiga 100" },
          { status: 400 }
        );
      }
      updates.discountValue = String(v);
    }
    if (body.minOrderAmount !== undefined) {
      updates.minOrderAmount =
        body.minOrderAmount != null && body.minOrderAmount !== ""
          ? String(parseFloat(String(body.minOrderAmount)) || 0)
          : null;
    }
    if (body.maxUses !== undefined) {
      updates.maxUses =
        body.maxUses != null && body.maxUses !== ""
          ? parseInt(String(body.maxUses), 10)
          : null;
    }
    if (body.validFrom !== undefined) {
      updates.validFrom =
        body.validFrom && String(body.validFrom).trim()
          ? new Date(body.validFrom)
          : null;
    }
    if (body.validUntil !== undefined) {
      updates.validUntil =
        body.validUntil && String(body.validUntil).trim()
          ? new Date(body.validUntil)
          : null;
    }
    if (body.active !== undefined) {
      updates.active = body.active ? "true" : "false";
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Inga uppdateringar" }, { status: 400 });
    }

    const [updated] = await db
      .update(discountCodes)
      .set(updates as Record<string, unknown>)
      .where(eq(discountCodes.id, couponId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Rabattkod hittades inte" }, { status: 404 });
    }

    return NextResponse.json({
      id: updated.id,
      code: updated.code,
      discountType: updated.discountType,
      discountValue: Number(updated.discountValue),
      minOrderAmount: updated.minOrderAmount ? Number(updated.minOrderAmount) : null,
      maxUses: updated.maxUses,
      usedCount: updated.usedCount,
      validFrom: updated.validFrom?.toISOString?.()?.slice(0, 10) ?? null,
      validUntil: updated.validUntil?.toISOString?.()?.slice(0, 10) ?? null,
      active: updated.active === "true",
    });
  } catch (err) {
    console.error("Failed to update coupon:", err);
    return NextResponse.json(
      { error: "Failed to update coupon" },
      { status: 500 }
    );
  }
}

/** DELETE /api/coupons/[id] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  try {
    const { id } = await params;
    const couponId = parseInt(id, 10);
    if (isNaN(couponId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const [deleted] = await db
      .delete(discountCodes)
      .where(eq(discountCodes.id, couponId))
      .returning({ id: discountCodes.id });

    if (!deleted) {
      return NextResponse.json({ error: "Rabattkod hittades inte" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete coupon:", err);
    return NextResponse.json(
      { error: "Failed to delete coupon" },
      { status: 500 }
    );
  }
}
