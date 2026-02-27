import { db } from "@repo/database";
import { discountCodes } from "@repo/database/schema";
import { desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/** GET /api/coupons - List all discount codes */
export async function GET() {
  try {
    const rows = await db
      .select()
      .from(discountCodes)
      .orderBy(desc(discountCodes.createdAt));

    const list = rows.map((r) => ({
      id: r.id,
      code: r.code,
      discountType: r.discountType,
      discountValue: Number(r.discountValue),
      minOrderAmount: r.minOrderAmount ? Number(r.minOrderAmount) : null,
      maxUses: r.maxUses,
      usedCount: r.usedCount,
      validFrom: r.validFrom?.toISOString?.()?.slice(0, 10) ?? null,
      validUntil: r.validUntil?.toISOString?.()?.slice(0, 10) ?? null,
      active: r.active === "true",
      createdAt: r.createdAt?.toISOString?.()?.slice(0, 10) ?? null,
    }));

    return NextResponse.json(list);
  } catch (err) {
    console.error("Failed to fetch coupons:", err);
    return NextResponse.json(
      { error: "Failed to fetch coupons" },
      { status: 500 }
    );
  }
}

/** POST /api/coupons - Create discount code */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = String(body?.code ?? "").trim().toUpperCase();
    const discountType = body?.discountType ?? "percent";
    const discountValue = parseFloat(String(body?.discountValue ?? 0)) || 0;
    const minOrderAmount =
      body?.minOrderAmount != null && body.minOrderAmount !== ""
        ? parseFloat(String(body.minOrderAmount))
        : null;
    const maxUses =
      body?.maxUses != null && body.maxUses !== ""
        ? parseInt(String(body.maxUses), 10)
        : null;
    const validFrom =
      body?.validFrom && String(body.validFrom).trim()
        ? new Date(body.validFrom)
        : null;
    const validUntil =
      body?.validUntil && String(body.validUntil).trim()
        ? new Date(body.validUntil)
        : null;
    const active = body?.active !== false ? "true" : "false";

    if (!code) {
      return NextResponse.json(
        { error: "Kod krävs" },
        { status: 400 }
      );
    }

    if (!["percent", "fixed"].includes(discountType)) {
      return NextResponse.json(
        { error: "discountType måste vara percent eller fixed" },
        { status: 400 }
      );
    }

    if (discountValue <= 0) {
      return NextResponse.json(
        { error: "Rabattvärde måste vara större än 0" },
        { status: 400 }
      );
    }

    if (discountType === "percent" && discountValue > 100) {
      return NextResponse.json(
        { error: "Procentrabatt kan inte överstiga 100" },
        { status: 400 }
      );
    }

    const [inserted] = await db
      .insert(discountCodes)
      .values({
        code,
        discountType,
        discountValue: String(discountValue),
        minOrderAmount: minOrderAmount != null ? String(minOrderAmount) : null,
        maxUses,
        validFrom,
        validUntil,
        active,
      })
      .returning();

    return NextResponse.json({
      id: inserted?.id,
      code: inserted?.code,
      discountType: inserted?.discountType,
      discountValue: Number(inserted?.discountValue),
      minOrderAmount: inserted?.minOrderAmount
        ? Number(inserted.minOrderAmount)
        : null,
      maxUses: inserted?.maxUses,
      usedCount: inserted?.usedCount ?? 0,
      validFrom: inserted?.validFrom?.toISOString?.()?.slice(0, 10) ?? null,
      validUntil: inserted?.validUntil?.toISOString?.()?.slice(0, 10) ?? null,
      active: inserted?.active === "true",
    });
  } catch (err) {
    console.error("Failed to create coupon:", err);
    const message =
      err && typeof err === "object" && "code" in err && err.code === "23505"
        ? "Denna rabattkod finns redan"
        : "Failed to create coupon";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
