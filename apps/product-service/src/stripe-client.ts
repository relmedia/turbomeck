import Stripe from "stripe";

/**
 * The service's Stripe client, or `null` when no usable key is configured.
 *
 * Nullable rather than throwing at import time so the rest of product-service
 * still starts and serves the catalog without Stripe — every caller checks and
 * returns a 503 instead. `index.ts` has worked this way since the beginning;
 * this module exists so the refund path shares that one client rather than
 * constructing a second one with a subtly different guard.
 *
 * `apiVersion` is deliberately left unpinned, matching every other Stripe
 * client in the monorepo. Pinning it here alone would change behaviour for
 * PaymentIntent creation and balance verification too, which is a separate
 * change with its own testing.
 */
export const stripeClient =
  process.env.STRIPE_SECRET_KEY?.trim() &&
  !process.env.STRIPE_SECRET_KEY.includes("placeholder")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

/** Message used wherever a handler has to refuse for want of a key. */
export const STRIPE_NOT_CONFIGURED =
  "Stripe is not configured on product-service (set STRIPE_SECRET_KEY)";
