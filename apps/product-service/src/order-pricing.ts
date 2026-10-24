import { db, products, discountCodes } from "@repo/database";
import {
  convertFromSek,
  currencyForCountry,
  type SupportedCurrency,
} from "@repo/currency";
import { getSekRate } from "@repo/currency/rate";
import { sql, inArray } from "drizzle-orm";
import {
  getShippingPrice,
  isOversize,
  priceExcludingVat,
  vatFromGross,
  vatRateForCountry,
  vatTreatmentForCountry,
  type VatTreatment,
} from "./shipping-pricing.js";

/** Fixed SEK surcharge when Swedish customer opts not to return the old turbo (charged at checkout). */
export const CORE_KEEP_FEE_SEK = 1000;

export type OrderItemInput = {
  productId?: number;
  productName: string;
  productImage?: string;
  variant?: string;
  price: number;
  quantity: number;
};

type ProductRow = typeof products.$inferSelect;

/**
 * A "stale" snapshot URL is one captured before we migrated images to R2:
 *   - bare path `/uploads/...`
 *   - absolute URL pointing at the dev hosts (`localhost:3001` / `:3002`).
 * For new orders we never want to persist these as `order_items.product_image`
 * — fall back to the live `products.image` (R2) instead.
 */
function isStaleProductImageUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  const u = url.trim();
  if (!u) return true;
  if (u.startsWith("/uploads/") || u.startsWith("uploads/")) return true;
  if (
    u.includes("localhost:3001/uploads/") ||
    u.includes("localhost:3002/uploads/") ||
    u.includes("127.0.0.1:3001/uploads/") ||
    u.includes("127.0.0.1:3002/uploads/")
  ) {
    return true;
  }
  return false;
}

function variantAllowed(product: ProductRow, variant: string | undefined | null): boolean {
  const rawAttrs = product.attributes;
  const attrs = Array.isArray(rawAttrs) ? rawAttrs : [];
  const attrsWithOptions = attrs.filter(
    (a): a is { name: string; options: string[] } =>
      typeof a?.name === "string" && Array.isArray(a.options) && a.options.length > 0,
  );
  if (attrsWithOptions.length === 0) {
    return variant == null || String(variant).trim() === "";
  }
  const v = String(variant ?? "").trim();
  if (!v) return false;
  const allowed = new Set(
    attrsWithOptions.flatMap((a) => a.options.map((opt) => `${a.name}: ${opt}`)),
  );
  return allowed.has(v);
}

/**
 * @param subtotal      goods total, used for the minimum-order test
 * @param discountBase  what the discount is taken from: goods + shipping
 */
async function resolveCouponDiscountSek(
  code: string,
  subtotal: number,
  discountBase: number,
): Promise<number | null> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;

  const rows = await db
    .select()
    .from(discountCodes)
    .where(sql`upper(${discountCodes.code}) = ${trimmed}`)
    .limit(1);
  const coupon = rows[0];
  if (!coupon) return null;
  if (coupon.active !== "true") return null;

  const now = new Date();
  if (coupon.validFrom && new Date(coupon.validFrom) > now) return null;
  if (coupon.validUntil && new Date(coupon.validUntil) < now) return null;
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) return null;

  const minAmount = coupon.minOrderAmount ? Number(coupon.minOrderAmount) : 0;
  if (subtotal < minAmount) return null;

  const value = Number(coupon.discountValue);
  if (coupon.discountType === "percent") {
    return Math.round(discountBase * (value / 100));
  }
  return Math.min(value, discountBase);
}

export type ResolvedCheckout =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      /** All money below is in `currency`, already converted and rounded. */
      currency: SupportedCurrency;
      /** SEK->currency multiplier used (1 for SEK). Stored on the order. */
      fxRate: number;
      subtotal: number;
      discount: number;
      shipping: number;
      coreKeepFeeSek: number;
      commitsCoreReturnWithin14: boolean | null;
      /**
       * How this sale is treated for VAT, decided once here and stored on the
       * order. Every VAT figure shown to a customer or to staff used to be
       * recomputed as `total * 0.2`, which silently invents Swedish VAT on an
       * export that carries none.
       */
      vatTreatment: VatTreatment;
      /** 0.25 domestic and EU B2C, 0 on a zero-rated export. */
      vatRate: number;
      /** VAT contained in `total`, in `currency`. Zero on an export. */
      vatAmount: number;
      total: number;
      /** Amount to charge, in `currency`. Named for history; not SEK-specific. */
      stripeChargeSek: number;
      lines: Array<{
        productId: number;
        productName: string;
        productImage: string | null;
        variant: string | null;
        unitPrice: number;
        quantity: number;
      }>;
    };

export async function resolveCheckoutOrder(body: {
  items: OrderItemInput[];
  couponCode?: string;
  country?: string;
  deliveryOption?: string;
  /** Sweden only: true = return old turbo within 14 days (no fee); false = pay CORE_KEEP_FEE_SEK at checkout */
  commitsCoreReturnWithin14?: boolean;
}): Promise<ResolvedCheckout> {
  const country = (body.country ?? "SE").toUpperCase().trim();
  /**
   * Decided here, before any price is read, because it changes the line
   * prices themselves — not just a number added at the end.
   */
  const vatTreatment: VatTreatment = vatTreatmentForCountry(country);
  const vatRate = vatRateForCountry(country);
  const deliveryRaw = body.deliveryOption ?? "servicepoint";
  const deliveryOption: "home" | "servicepoint" =
    deliveryRaw === "home" ? "home" : "servicepoint";

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { ok: false, status: 400, error: "Order must have at least one item" };
  }

  const productIds: number[] = [];
  for (const it of body.items) {
    const pid = it.productId;
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
      return { ok: false, status: 400, error: "Each line item must include a valid productId" };
    }
    const q = it.quantity;
    if (typeof q !== "number" || !Number.isInteger(q) || q < 1 || q > 999) {
      return { ok: false, status: 400, error: "Invalid quantity" };
    }
    productIds.push(pid);
  }

  const uniqueIds = [...new Set(productIds)];
  const rows = await db.select().from(products).where(inArray(products.id, uniqueIds));
  const byId = new Map(rows.map((p) => [p.id, p]));

  let cartNeedsCoreReturn = false;

  const lineAcc: Array<{
    productId: number;
    productName: string;
    productImage: string | null;
    variant: string | null;
    unitPrice: number;
    quantity: number;
  }> = [];

  let subtotal = 0;
  let totalWeightKg = 0;
  /** Parcel dimensions of the catalog rows, for the oversize surcharge. */
  const parcelDimensions: Array<{
    lengthCm: number | null;
    widthCm: number | null;
    heightCm: number | null;
  }> = [];

  for (const it of body.items) {
    const pid = it.productId!;
    const p = byId.get(pid);
    if (!p) {
      return { ok: false, status: 400, error: `Unknown product: ${pid}` };
    }
    if (!variantAllowed(p, it.variant)) {
      return { ok: false, status: 400, error: `Invalid variant for product ${pid}` };
    }
    if (p.stock < it.quantity) {
      return { ok: false, status: 400, error: `Insufficient stock for product ${pid}` };
    }

    if (p.isExchangeTurbo) {
      cartNeedsCoreReturn = true;
    }

    const catalogPrice = Number(p.price);
    if (!Number.isFinite(catalogPrice) || catalogPrice < 0) {
      return { ok: false, status: 500, error: "Invalid catalog price" };
    }

    /**
     * Catalogue prices are stored VAT-inclusive. On a zero-rated export the
     * Swedish VAT has to come back OUT of the price — charging the gross price
     * and calling it zero-rated just hides the 25% inside it, and the buyer
     * then pays their own import VAT on top of ours.
     */
    const unitPrice =
      vatTreatment === "export_zero_rated" ? priceExcludingVat(catalogPrice) : catalogPrice;

    subtotal += Math.round(unitPrice * it.quantity);

    const w = p.weight != null ? Number(p.weight) : 1;
    const wkg = Number.isFinite(w) && w > 0 ? w : 1;
    totalWeightKg += wkg * it.quantity;

    parcelDimensions.push({
      lengthCm: p.lengthCm ?? null,
      widthCm: p.widthCm ?? null,
      heightCm: p.heightCm ?? null,
    });

    const submittedImage = it.productImage;
    const safeImage = isStaleProductImageUrl(submittedImage)
      ? (p.image ?? null)
      : (submittedImage ?? p.image ?? null);

    lineAcc.push({
      productId: pid,
      productName: p.name,
      productImage: safeImage,
      variant: it.variant ?? null,
      unitPrice,
      quantity: it.quantity,
    });
  }

  const isSe = country === "SE";
  let commitsCoreReturnWithin14: boolean | null = null;
  if (isSe && cartNeedsCoreReturn) {
    if (typeof body.commitsCoreReturnWithin14 !== "boolean") {
      return {
        ok: false,
        status: 400,
        error: "Välj om du skickar in din gamla turbo inom 14 dagar eller betalar kärnavgift.",
      };
    }
    commitsCoreReturnWithin14 = body.commitsCoreReturnWithin14;
  }

  const coreKeepFeeSek =
    isSe && cartNeedsCoreReturn && commitsCoreReturnWithin14 === false
      ? CORE_KEEP_FEE_SEK
      : 0;

  /**
   * PostNord charges extra for a parcel longer than 1.2 m. The flag existed on
   * the pricing helpers from the start but nothing ever passed it, so the fee
   * was never applied and the shop absorbed it. Products now record their
   * dimensions, so it can finally be computed — from the catalog rows, never
   * from the client.
   */
  const oversize = isOversize(parcelDimensions);
  const shipping = getShippingPrice(
    Math.max(0.1, totalWeightKg),
    country,
    deliveryOption,
    oversize,
  );

  let discount = 0;
  const couponCode = typeof body.couponCode === "string" ? body.couponCode.trim() : "";
  if (couponCode) {
    // Coupons discount goods + shipping. The core-keep fee is excluded on purpose:
    // it is a penalty for not returning the old turbo, not part of the order value.
    const d = await resolveCouponDiscountSek(couponCode, subtotal, subtotal + shipping);
    if (d == null) {
      return { ok: false, status: 400, error: "Invalid or inapplicable coupon code" };
    }
    discount = d;
  }

  // Everything above is SEK, because the catalogue, the shipping tiers and the
  // coupons are all SEK. Convert once, here, so there is exactly one place
  // where the charge currency is decided — and convert each component, not
  // just the total, so the order reconciles from its own rounded parts.
  const currency = currencyForCountry(country);
  const fxRate = await getSekRate(currency);
  const toCharge = (amountSek: number) => convertFromSek(amountSek, currency, fxRate);

  const convertedLines = lineAcc.map((line) => ({
    ...line,
    unitPrice: toCharge(line.unitPrice),
  }));
  const convertedSubtotal = convertedLines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );
  const convertedShipping = toCharge(shipping);
  const convertedDiscount = Math.min(
    toCharge(discount),
    convertedSubtotal + convertedShipping,
  );
  const convertedCoreFee = toCharge(coreKeepFeeSek);

  const total = Math.max(
    0,
    convertedSubtotal + convertedShipping - convertedDiscount + convertedCoreFee,
  );
  const stripeChargeSek = total;

  /**
   * Computed from the final charged total so it reconciles with what Stripe
   * captured, and stored rather than re-derived later. On an export the rate
   * is 0 and this is 0 — not "0.2 of the total", which is what every display
   * site used to assume.
   */
  const vatAmount = vatFromGross(total, vatRate);

  return {
    ok: true,
    currency,
    fxRate,
    subtotal: convertedSubtotal,
    discount: convertedDiscount,
    shipping: convertedShipping,
    coreKeepFeeSek: convertedCoreFee,
    commitsCoreReturnWithin14,
    vatTreatment,
    vatRate,
    vatAmount,
    total,
    stripeChargeSek,
    lines: convertedLines,
  };
}
