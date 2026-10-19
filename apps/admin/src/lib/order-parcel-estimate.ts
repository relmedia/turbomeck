/**
 * Estimate a parcel's weight and bulk from the products in an order.
 *
 * The booking form defaulted to a hardcoded 3 kg regardless of what was in the
 * box, and the route used the same literal when the client sent nothing — so
 * every shipment was filed at 3 kg unless someone remembered to type the real
 * figure. Products carry `weight` (and now dimensions), so the server can work
 * it out.
 *
 * `order_items` stores only name/price/quantity, so this joins back to
 * `products` via the existing `productId` FK. Lines whose product was deleted,
 * or which never had a weight, fall back to 1 kg per unit — the same
 * convention `apps/product-service/src/order-pricing.ts` already uses to price
 * shipping, so the admin's estimate and the customer's charge agree.
 */

import { db } from "@repo/database";
import { orderItems, products } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { isOversize } from "@repo/shipping";

/** PostNord's per-parcel ceiling, mirroring the clamp in postnord-booking-edi.ts. */
const MAX_PARCEL_KG = 35;
const MIN_PARCEL_KG = 0.1;
/** Same assumption as order-pricing.ts when a product has no usable weight. */
const ASSUMED_KG_PER_UNIT = 1;

export type OrderParcelEstimate = {
  /** Clamped to [0.1, 35] and rounded to 0.1 kg, ready for the EDI payload. */
  weightKg: number;
  /** "fallback" when not one line had a usable product weight. */
  source: "products" | "fallback";
  /** True when any single item's longest side exceeds PostNord's 120 cm. */
  oversize: boolean;
  /** Product names that contributed an assumed weight rather than a real one. */
  missingWeights: string[];
};

/** The arithmetic, separated from the query so it can be verified without a DB. */
export function summariseParcel(
  lines: Array<{
    productName: string;
    quantity: number;
    weight: number | null;
    lengthCm: number | null;
    widthCm: number | null;
    heightCm: number | null;
  }>,
): OrderParcelEstimate {
  let total = 0;
  let anyRealWeight = false;
  const missingWeights: string[] = [];

  for (const line of lines) {
    const qty = Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : 1;
    const w = line.weight;
    const usable = typeof w === "number" && Number.isFinite(w) && w > 0;
    if (usable) {
      anyRealWeight = true;
      total += w * qty;
    } else {
      total += ASSUMED_KG_PER_UNIT * qty;
      if (!missingWeights.includes(line.productName)) missingWeights.push(line.productName);
    }
  }

  const clamped = Math.max(
    MIN_PARCEL_KG,
    Math.min(MAX_PARCEL_KG, Math.round(total * 10) / 10),
  );

  return {
    weightKg: clamped,
    source: anyRealWeight ? "products" : "fallback",
    oversize: isOversize(lines),
    missingWeights,
  };
}

export async function getOrderParcelEstimate(orderId: number): Promise<OrderParcelEstimate> {
  const rows = await db
    .select({
      productName: orderItems.productName,
      quantity: orderItems.quantity,
      weight: products.weight,
      lengthCm: products.lengthCm,
      widthCm: products.widthCm,
      heightCm: products.heightCm,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));

  return summariseParcel(
    rows.map((r) => ({
      productName: r.productName,
      quantity: r.quantity,
      // products.weight is a decimal column, so it arrives as a string.
      weight: r.weight != null ? Number(r.weight) : null,
      lengthCm: r.lengthCm ?? null,
      widthCm: r.widthCm ?? null,
      heightCm: r.heightCm ?? null,
    })),
  );
}
