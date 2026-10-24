/**
 * Calls product-service to send one automated order email.
 *
 * All customer mail lives in product-service (it owns the templates, the SMTP
 * settings row, and the product-image proxy), so admin asks rather than sends.
 * This mirrors `triggerShipmentDispatchedEmail`, but reaches a single endpoint
 * parameterised by kind instead of needing a new route per mail.
 *
 * It throws on failure, deliberately. The ledger records a claim before the
 * send and only confirms it afterwards, so an exception here leaves a
 * retryable claim — swallowing the error would mark the mail sent when it was
 * not.
 */

import type { OrderEmailKind } from "@/lib/order-email-ledger";

function productServiceBase(): string {
  let base = (process.env.PRODUCT_SERVICE_URL || "http://localhost:8000").replace(/\/$/u, "");
  if (base.endsWith("/api")) base = base.slice(0, -4);
  return base;
}

export type NotificationResult = {
  sent: boolean;
  recipient?: string | null;
  /** Set when the send was declined by configuration rather than failing. */
  skipped?: string;
};

export async function sendOrderNotification(
  orderId: number,
  kind: OrderEmailKind,
  locale: "sv" | "en" = "sv",
): Promise<NotificationResult> {
  const secret = process.env.INTERNAL_PRODUCT_API_SECRET?.trim();
  if (!secret) {
    throw new Error("INTERNAL_PRODUCT_API_SECRET is not set on admin (cannot call product-service)");
  }

  const res = await fetch(`${productServiceBase()}/api/orders/${orderId}/notifications/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ locale }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    sent?: boolean;
    recipient?: string | null;
    skipped?: string;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(`Notification ${kind} HTTP ${res.status}: ${payload.error ?? res.statusText}`);
  }

  /**
   * A mail switched off in settings is not a failure — but it must not be
   * recorded as sent either, or turning the setting back on would never
   * deliver it. Reported up so the caller can release the claim.
   */
  if (payload.sent === false) {
    if (payload.skipped) return { sent: false, skipped: payload.skipped };
    throw new Error(`Product-service reported ${kind} was not sent`);
  }

  return { sent: true, recipient: payload.recipient ?? null };
}
