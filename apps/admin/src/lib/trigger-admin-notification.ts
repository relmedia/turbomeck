/**
 * Fire-and-forget POST to a product-service "notify" endpoint.
 *
 * Failures only log: admin notifications are non-critical so a flaky SMTP
 * server or missing settings must never block the original action
 * (review submit, user delete, shipment booking).
 */
function getProductServiceBase(): string {
  let base = (process.env.PRODUCT_SERVICE_URL || "http://localhost:8000").replace(
    /\/$/u,
    "",
  );
  if (base.endsWith("/api")) base = base.slice(0, -4);
  return base;
}

async function postNotify(path: string, body: unknown): Promise<void> {
  const secret = process.env.INTERNAL_PRODUCT_API_SECRET?.trim();
  if (!secret) {
    console.warn(
      `[admin-notify] INTERNAL_PRODUCT_API_SECRET missing; skipping ${path}`,
    );
    return;
  }
  try {
    const res = await fetch(`${getProductServiceBase()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[admin-notify] ${path} -> HTTP ${res.status}: ${text || res.statusText}`,
      );
    }
  } catch (err) {
    console.error(`[admin-notify] ${path} failed:`, err);
  }
}

export function notifyUserDeleted(payload: {
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  initiator: "self" | "admin";
  performedBy?: string | null;
}): Promise<void> {
  return postNotify("/api/admin/notify/user-deleted", payload);
}

export function notifyShipmentBooked(payload: {
  orderId: number | string;
  orderNumber: string;
  trackingId: string;
  customerName: string;
  customerEmail?: string | null;
  servicePointName?: string | null;
  weightKg?: number | null;
  performedBy?: string | null;
}): Promise<void> {
  return postNotify("/api/admin/notify/shipment-booked", payload);
}
