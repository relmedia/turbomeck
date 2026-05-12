import { db } from "@repo/database";
import { discountCodes } from "@repo/database/schema";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/coupons/validate
 * Body: { code: string, subtotal: number }
 * Returns: { valid: boolean, discount?: number, discountType?: string, message?: string }
 */
export async function POST(request: NextRequest) {
  // SECURITY (audit M4): without a limit, an attacker can enumerate every
  // active discount code in the table by guessing prefixes against this
  // endpoint (it discloses validity, value, and minimum order). 20 requests
  // per minute per IP is roomy enough for the legitimate "type code, click
  // apply" UX and tight enough to make brute-forcing pointless.
  const limited = rateLimit(request, {
    bucket: "coupons-validate",
    windowMs: 60_000,
    max: 20,
  });
  if (limited) return limited;

  try {
    const body = await request.json();
    const code = String(body?.code ?? "").trim().toUpperCase();
    const subtotal = parseFloat(String(body?.subtotal ?? 0)) || 0;

    if (!code) {
      return NextResponse.json({
        valid: false,
        message: "Ange en rabattkod",
      });
    }

    const rows = await db
      .select()
      .from(discountCodes)
      .where(sql`upper(${discountCodes.code}) = ${code}`)
      .limit(1);
    const coupon = rows[0];

    if (!coupon) {
      return NextResponse.json({
        valid: false,
        message: "Ogiltig rabattkod",
      });
    }

    if (coupon.active !== "true") {
      return NextResponse.json({
        valid: false,
        message: "Rabattkoden är inte längre aktiv",
      });
    }

    const now = new Date();
    if (coupon.validFrom && new Date(coupon.validFrom) > now) {
      return NextResponse.json({
        valid: false,
        message: "Rabattkoden är inte giltig än",
      });
    }
    if (coupon.validUntil && new Date(coupon.validUntil) < now) {
      return NextResponse.json({
        valid: false,
        message: "Rabattkoden har gått ut",
      });
    }

    if (
      coupon.maxUses != null &&
      coupon.usedCount >= coupon.maxUses
    ) {
      return NextResponse.json({
        valid: false,
        message: "Rabattkoden har nått maxantal användningar",
      });
    }

    const minAmount = coupon.minOrderAmount
      ? Number(coupon.minOrderAmount)
      : 0;
    if (subtotal < minAmount) {
      return NextResponse.json({
        valid: false,
        message: `Minstordervärde ${minAmount.toLocaleString("sv-SE")} kr krävs`,
      });
    }

    const value = Number(coupon.discountValue);
    const discount =
      coupon.discountType === "percent"
        ? Math.round(subtotal * (value / 100))
        : Math.min(value, subtotal);

    return NextResponse.json({
      valid: true,
      discount,
      discountType: coupon.discountType,
      message: `Rabatt på ${discount.toLocaleString("sv-SE")} kr tillämpad`,
    });
  } catch (err) {
    console.error("[coupons/validate]", err);
    return NextResponse.json(
      { valid: false, message: "Ett fel uppstod" },
      { status: 500 }
    );
  }
}
