import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@repo/database";
import { orders } from "@repo/database/schema";
import { eq, or } from "drizzle-orm";
import {
  internalProductApiAuthHeaders,
  requireInternalProductApiSecret,
} from "@/lib/internal-product-api";

const PRODUCT_SERVICE =
  process.env.PRODUCT_SERVICE_URL ||
  process.env.NEXT_PUBLIC_PRODUCT_API_URL ||
  "http://localhost:8000";

/**
 * Ask product-service to create the order for a succeeded payment that has no
 * order yet, from the snapshot stored when the PaymentIntent was created.
 *
 * This is the safety net for the gap between "Stripe took the money" and "the
 * browser POSTed the order": a 3-D Secure detour can return before the intent
 * reaches `succeeded` (the order POST is then rejected with "Payment has not
 * succeeded"), the customer can close the tab, or a cross-origin redirect can
 * strand the sessionStorage snapshot. Stripe retries webhooks for days, and
 * the endpoint is idempotent, so the order lands exactly once.
 *
 * Throws on transient failures: the caller returns 500 and Stripe retries.
 */
async function finalizeCheckoutFromSnapshot(piId: string): Promise<boolean> {
  requireInternalProductApiSecret();
  const res = await fetch(
    `${PRODUCT_SERVICE.replace(/\/$/, "")}/api/checkout-intents/${encodeURIComponent(piId)}/finalize`,
    {
      method: "POST",
      headers: { ...internalProductApiAuthHeaders() },
      cache: "no-store",
    },
  );

  if (res.status === 404) {
    // No snapshot: a payment from before this existed, or another app on the
    // same Stripe account. Nothing to do, and no point making Stripe retry.
    console.warn("[stripe webhook] no checkout snapshot for PI", piId);
    return false;
  }
  if (res.status === 422) {
    // Snapshot is unusable (incomplete shipping fields). Retrying won't fix it.
    console.error(
      "[stripe webhook] unusable checkout snapshot for PI",
      piId,
      await res.text().catch(() => ""),
    );
    return false;
  }
  if (!res.ok) {
    throw new Error(
      `finalize failed (${res.status}): ${await res.text().catch(() => "")}`,
    );
  }

  const data = (await res.json().catch(() => ({}))) as {
    created?: boolean;
    order?: { id?: number; orderNumber?: string };
    reason?: string;
  };
  if (data.created) {
    console.log(
      "[stripe webhook] created order from snapshot",
      piId,
      data.order?.id,
      data.order?.orderNumber,
    );
  } else {
    console.log("[stripe webhook] finalize no-op", piId, data.reason);
  }
  return Boolean(data.created);
}

/**
 * Stripe webhook handler.
 *
 * SECURITY (audit H2): without webhook signature verification, anyone who can
 * reach this URL can POST a hand-crafted `payment_intent.succeeded` payload
 * and trick the server into marking an order paid. We do three things:
 *
 *  1. Use `stripe.webhooks.constructEvent(raw, sig, secret)` — this checks
 *     the HMAC-SHA256 over the raw body using STRIPE_WEBHOOK_SECRET.
 *     Anything that fails the check returns a 400 and is never processed.
 *  2. Read the *raw* request body via `request.text()` (NOT `request.json()`)
 *     — Stripe's HMAC is computed over the bytes Stripe sent, so the slightest
 *     re-serialization would invalidate it.
 *  3. Refuse to start without `STRIPE_WEBHOOK_SECRET` set. Returning a 503
 *     means a misconfigured deploy fails loudly instead of silently never
 *     accepting webhooks.
 *
 * Setup notes (operator):
 *   - Set STRIPE_WEBHOOK_SECRET to the `whsec_...` value Stripe shows when you
 *     create the endpoint. For local dev use the `stripe listen` CLI which
 *     prints a `whsec_...` for the tunneled endpoint.
 *   - Configure the endpoint URL in the Stripe Dashboard or via the CLI:
 *       https://<your-domain>/api/stripe/webhook
 *   - Recommended events:
 *       payment_intent.succeeded
 *       payment_intent.payment_failed
 *       payment_intent.canceled
 *     We listen for everything else and acknowledge with 200 so Stripe's
 *     dashboard doesn't show retries, but we only mutate state for these.
 */
export const runtime = "nodejs";
// Disable any caching — webhooks are always dynamic.
export const dynamic = "force-dynamic";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Lazy-init Stripe — keeps boot-time clean when key isn't set in dev.
function getStripe(): Stripe | null {
  if (!STRIPE_SECRET_KEY?.trim() || STRIPE_SECRET_KEY.includes("placeholder")) {
    return null;
  }
  return new Stripe(STRIPE_SECRET_KEY);
}

export async function POST(request: NextRequest) {
  if (!STRIPE_WEBHOOK_SECRET?.trim()) {
    console.error(
      "[stripe webhook] STRIPE_WEBHOOK_SECRET is not set — refusing to process webhooks.",
    );
    return NextResponse.json(
      { error: "Stripe webhook not configured" },
      { status: 503 },
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  // CRITICAL: read raw bytes, not JSON. constructEvent needs the exact body
  // Stripe signed.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.warn("[stripe webhook] signature verification failed:", message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await handlePaymentSucceeded(pi);
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailed(pi);
        break;
      }
      case "payment_intent.canceled": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailed(pi);
        break;
      }
      default:
        // Acknowledge so Stripe doesn't retry; nothing to do.
        break;
    }
  } catch (err) {
    console.error(
      "[stripe webhook] failed handling event",
      event.type,
      event.id,
      err,
    );
    // Return 500 so Stripe retries — the event was valid, our handler failed.
    return NextResponse.json(
      { error: "Webhook handler error" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

/**
 * Mark the matching order as paid (initial deposit) or completed (balance).
 *
 * Lookup order: we only ever update an order whose `stripePaymentId` or
 * `stripeBalancePaymentId` already matches the incoming `PaymentIntent.id`,
 * so a forged `metadata.orderId` cannot redirect us to an unrelated order.
 */
async function handlePaymentSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
  const piId = pi.id;
  const [order] = await db
    .select({
      id: orders.id,
      status: orders.status,
      stripePaymentId: orders.stripePaymentId,
      stripeBalancePaymentId: orders.stripeBalancePaymentId,
    })
    .from(orders)
    .where(
      or(
        eq(orders.stripePaymentId, piId),
        eq(orders.stripeBalancePaymentId, piId),
      ),
    )
    .limit(1);

  if (!order) {
    // No order for a succeeded payment: the browser never completed checkout.
    // Create it from the server-side snapshot instead of dropping the payment.
    await finalizeCheckoutFromSnapshot(piId);
    return;
  }

  if (order.stripeBalancePaymentId === piId) {
    // Balance payment for a deposit-flow order → fully settled.
    if (order.status !== "completed") {
      await db
        .update(orders)
        .set({ status: "completed" })
        .where(eq(orders.id, order.id));
      console.log(
        `[stripe webhook] order ${order.id} balance paid (PI ${piId}) → status=completed`,
      );
    }
    return;
  }

  // Initial deposit / full payment.
  if (order.status === "pending") {
    await db
      .update(orders)
      .set({ status: "confirmed" })
      .where(eq(orders.id, order.id));
    console.log(
      `[stripe webhook] order ${order.id} payment confirmed (PI ${piId})`,
    );
  }
}

async function handlePaymentFailed(pi: Stripe.PaymentIntent): Promise<void> {
  const piId = pi.id;
  const [order] = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(
      or(
        eq(orders.stripePaymentId, piId),
        eq(orders.stripeBalancePaymentId, piId),
      ),
    )
    .limit(1);

  if (!order) {
    console.warn("[stripe webhook] payment failure for unknown PI", piId);
    return;
  }

  // Only transition orders that were waiting on this payment; do not mark
  // a delivered order failed because Stripe surfaced a retried decline.
  if (order.status === "pending") {
    await db
      .update(orders)
      .set({ status: "cancelled" })
      .where(eq(orders.id, order.id));
    console.log(
      `[stripe webhook] order ${order.id} payment failed (PI ${piId}) → status=cancelled`,
    );
  }
}
