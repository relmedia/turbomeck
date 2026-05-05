import { db, products, discountCodes } from "@repo/database";
import { sql, inArray } from "drizzle-orm";
import { getShippingPrice } from "./shipping-pricing.js";

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

async function resolveCouponDiscountSek(code: string, subtotal: number): Promise<number | null> {
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
    return Math.round(subtotal * (value / 100));
  }
  return Math.min(value, subtotal);
}

export type ResolvedCheckout =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      subtotal: number;
      discount: number;
      shipping: number;
      coreKeepFeeSek: number;
      commitsCoreReturnWithin14: boolean | null;
      total: number;
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

    const unitPrice = Number(p.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { ok: false, status: 500, error: "Invalid catalog price" };
    }

    subtotal += Math.round(unitPrice * it.quantity);

    const w = p.weight != null ? Number(p.weight) : 1;
    const wkg = Number.isFinite(w) && w > 0 ? w : 1;
    totalWeightKg += wkg * it.quantity;

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

  let discount = 0;
  const couponCode = typeof body.couponCode === "string" ? body.couponCode.trim() : "";
  if (couponCode) {
    const d = await resolveCouponDiscountSek(couponCode, subtotal);
    if (d == null) {
      return { ok: false, status: 400, error: "Invalid or inapplicable coupon code" };
    }
    discount = d;
  }

  const shipping = getShippingPrice(Math.max(0.1, totalWeightKg), country, deliveryOption);
  const total = Math.max(0, Math.round(subtotal - discount + shipping + coreKeepFeeSek));
  const stripeChargeSek = total;

  return {
    ok: true,
    subtotal: Math.round(subtotal),
    discount,
    shipping,
    coreKeepFeeSek,
    commitsCoreReturnWithin14,
    total,
    stripeChargeSek,
    lines: lineAcc,
  };
}
