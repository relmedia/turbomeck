/**
 * Admin → product-service calls for Stripe refunds.
 *
 * Stripe lives in product-service: it already holds the secret key, the DB and
 * the internal-bearer guard, and it is loopback-only in production. The admin
 * app deliberately holds no Stripe key — it is the internet-facing process.
 *
 * Shaped after trigger-shipment-dispatched-email.ts, including the trailing
 * `/api` strip, because PRODUCT_SERVICE_URL is set with and without it in
 * different environments.
 */

export type ChargeKind = "full" | "deposit" | "balance";

export type RefundableCharge = {
  kind: ChargeKind;
  label: string;
  currency: string;
  amount: number;
  amountRefunded: number;
  pendingLocal: number;
  refundable: number;
  last4: string | null;
  blockedReason: string | null;
};

export type RefundRow = {
  id: number;
  chargeKind: string;
  amount: number;
  currency: string;
  status: string;
  note: string | null;
  performedBy: string | null;
  stripeRefundId: string | null;
  stripeFailureReason: string | null;
  emailSentAt: string | null;
  createdAt: string;
};

export type RefundQuote = {
  currency: string;
  charges: RefundableCharge[];
  refunds: RefundRow[];
};

export type IssueRefundResponse = {
  success: true;
  refund: RefundRow;
  deduplicated: boolean;
  orderStatus: string;
  fullyRefunded: boolean;
  emailSent: boolean;
  emailError: string | null;
};

function productServiceBase(): string {
  let base = (process.env.PRODUCT_SERVICE_URL || "http://localhost:8000").replace(/\/$/, "");
  if (base.endsWith("/api")) base = base.slice(0, -4);
  return base;
}

function internalHeaders(): Record<string, string> {
  const secret = process.env.INTERNAL_PRODUCT_API_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "INTERNAL_PRODUCT_API_SECRET is not set on admin (cannot call product-service)",
    );
  }
  return { "Content-Type": "application/json", Authorization: `Bearer ${secret}` };
}

/** Pass product-service's own status and Swedish message straight through. */
async function readOrThrow(res: Response): Promise<unknown> {
  const payload = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    const err = new Error(payload?.error || `Product-service HTTP ${res.status}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return payload;
}

export async function fetchRefundQuote(orderId: number): Promise<RefundQuote> {
  const res = await fetch(`${productServiceBase()}/api/orders/${orderId}/refundable`, {
    headers: internalHeaders(),
    cache: "no-store",
  });
  return (await readOrThrow(res)) as RefundQuote;
}

export async function postOrderRefund(input: {
  orderId: number;
  kind: ChargeKind;
  amount: number;
  requestId: string;
  note?: string | null;
  performedBy: string;
  notifyCustomer: boolean;
}): Promise<IssueRefundResponse> {
  const res = await fetch(`${productServiceBase()}/api/orders/${input.orderId}/refund`, {
    method: "POST",
    headers: internalHeaders(),
    body: JSON.stringify({
      kind: input.kind,
      amount: input.amount,
      requestId: input.requestId,
      note: input.note ?? null,
      performedBy: input.performedBy,
      notifyCustomer: input.notifyCustomer,
      locale: "sv",
    }),
  });
  return (await readOrThrow(res)) as IssueRefundResponse;
}
