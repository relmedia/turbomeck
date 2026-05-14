/**
 * Fire-and-forget POST to a product-service "notify" endpoint from the
 * customer-facing app. Mirrors the admin helper so both apps can hand off
 * admin alerts without each duplicating the SMTP transport.
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
      `[client-notify] INTERNAL_PRODUCT_API_SECRET missing; skipping ${path}`,
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
        `[client-notify] ${path} -> HTTP ${res.status}: ${text || res.statusText}`,
      );
    }
  } catch (err) {
    console.error(`[client-notify] ${path} failed:`, err);
  }
}

export function notifyNewReview(payload: {
  productId: number | string;
  productName: string;
  reviewId: number | string;
  reviewerName: string;
  reviewerEmail?: string | null;
  rating: number;
  title?: string | null;
  comment?: string | null;
  verifiedPurchase: boolean;
}): Promise<void> {
  return postNotify("/api/admin/notify/new-review", payload);
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
