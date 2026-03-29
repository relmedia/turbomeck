/**
 * Calls product-service to send “shipped” email (must complete — do not float on serverless).
 * Strips trailing /api from PRODUCT_SERVICE_URL if set by mistake.
 */
export async function triggerShipmentDispatchedEmail(orderId: number): Promise<void> {
  const secret = process.env.INTERNAL_PRODUCT_API_SECRET?.trim();
  let base = (process.env.PRODUCT_SERVICE_URL || "http://localhost:8000").replace(/\/$/, "");
  if (base.endsWith("/api")) {
    base = base.slice(0, -4);
  }
  if (!secret) {
    throw new Error("INTERNAL_PRODUCT_API_SECRET is not set on admin (cannot call product-service)");
  }
  const res = await fetch(`${base}/api/orders/${orderId}/send-shipment-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ locale: "sv" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shipment notification HTTP ${res.status}: ${text || res.statusText}`);
  }
  const payload = (await res.json().catch(() => ({}))) as { success?: boolean };
  if (payload.success === false) {
    throw new Error("Product-service reported shipment email was not sent");
  }
}
