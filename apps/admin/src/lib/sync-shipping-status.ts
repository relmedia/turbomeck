import { db } from "@repo/database";
import { orders } from "@repo/database/schema";
import { and, eq, isNotNull } from "drizzle-orm";

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
  const apiKey = process.env.POSTNORD_API_KEY?.trim();
  if (!apiKey || apiKey === "your_postnord_api_key_here") return null;

  const host =
    process.env.POSTNORD_USE_TEST_API === "true"
      ? "atapi2.postnord.com"
      : process.env.POSTNORD_API_HOST ?? "api2.postnord.com";

  const url = new URL(`https://${host}/rest/shipment/v2/trackandtrace/findByIdentifier.json`);
  url.searchParams.set("id", trackingId);
  url.searchParams.set("locale", "sv");
  url.searchParams.set("apikey", apiKey);

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
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
