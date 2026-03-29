import { db } from "@repo/database";
import { orders } from "@repo/database/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { fetchPostNordTrackingJson } from "@/lib/postnord-track-shipment";

const DELIVERED_INDICATORS = [
  "delivered",
  "levererad",
  "utlämnad",
  "utlämning",
  "avhämtat",
  "received",
  "received by recipient",
];

function isDeliveredInResponse(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const str = JSON.stringify(data).toLowerCase();
  return DELIVERED_INDICATORS.some((k) => str.includes(k));
}

async function fetchPostNordTracking(trackingId: string): Promise<unknown> {
  const result = await fetchPostNordTrackingJson(trackingId, "sv");
  if (!result.ok) return null;
  return result.data;
}

/**
 * Polls PostNord Track API for shipped orders and auto-updates to "delivered" when PostNord reports delivery.
 */
export async function syncShippingStatus(): Promise<{ checked: number; updated: number }> {
  const shippedOrders = await db
    .select({ id: orders.id, postNordTrackingId: orders.postNordTrackingId })
    .from(orders)
    .where(and(eq(orders.status, "shipped"), isNotNull(orders.postNordTrackingId)));

  let updated = 0;
  for (const order of shippedOrders) {
    const tid = String(order.postNordTrackingId ?? "").trim();
    if (!tid || tid.toLowerCase() === "null") continue;

    const data = await fetchPostNordTracking(tid);
    if (!data || !isDeliveredInResponse(data)) continue;

    await db.update(orders).set({ status: "delivered" }).where(eq(orders.id, order.id));
    updated++;
  }

  return { checked: shippedOrders.length, updated };
}
