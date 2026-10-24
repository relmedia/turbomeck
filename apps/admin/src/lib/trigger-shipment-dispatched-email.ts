/**
 * Calls product-service to send the “shipped” email (must complete — do not
 * float on serverless). Strips trailing /api from PRODUCT_SERVICE_URL if set by
 * mistake.
 *
 * This is the HUMAN path: the "Skicka fraktmail" button, and the heuristic on
 * the order PATCH. It records the send in `order_emails` for the same reason
 * the automated path does — the shipping poller now sends this mail too, on
 * PostNord's EN_ROUTE signal, and without a shared record the two paths would
 * each mail the customer once. The ledger is what makes them one thing.
 */

import {
  claimOrderEmail,
  markOrderEmailSent,
  markOrderEmailFailed,
} from "@/lib/order-email-ledger";

export type DispatchEmailOptions = {
  /**
   * Send even though the ledger says it has already gone out.
   *
   * The button passes this when staff deliberately re-send — a customer who
   * deleted the mail, a corrected address. The automated path never does.
   */
  force?: boolean;
};

export type DispatchEmailOutcome = {
  sent: boolean;
  /** Set when the ledger already had this mail and `force` was not given. */
  alreadySent?: boolean;
};

export async function triggerShipmentDispatchedEmail(
  orderId: number,
  options: DispatchEmailOptions = {},
): Promise<DispatchEmailOutcome> {
  const secret = process.env.INTERNAL_PRODUCT_API_SECRET?.trim();
  let base = (process.env.PRODUCT_SERVICE_URL || "http://localhost:8000").replace(/\/$/, "");
  if (base.endsWith("/api")) {
    base = base.slice(0, -4);
  }
  if (!secret) {
    throw new Error("INTERNAL_PRODUCT_API_SECRET is not set on admin (cannot call product-service)");
  }

  /**
   * Claim first. If the poller already sent this (or is sending it right now),
   * stop — unless a human explicitly asked to send it again.
   */
  const claim = await claimOrderEmail(orderId, "shipment_dispatched", { source: "manual" });
  if (!claim.claimed && !options.force) {
    return { sent: false, alreadySent: true };
  }
  const claimId = claim.claimed ? claim.id : null;

  try {
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

    if (claimId != null) await markOrderEmailSent(claimId);
    return { sent: true };
  } catch (err) {
    // Leave sentAt NULL so the claim ages out and the poller can retry.
    if (claimId != null) await markOrderEmailFailed(claimId, err);
    throw err;
  }
}
