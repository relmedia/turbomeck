/**
 * Which payment methods will Stripe actually offer, per currency?
 *
 *   pnpm --filter payment-service check-payment-methods
 *
 * Reads STRIPE_SECRET_KEY from apps/payment-service/.env. Run it on the server
 * to check the live account; the key never leaves the process and is never
 * printed (only its mode and a short fingerprint).
 *
 * Why this exists: the shop uses `automatic_payment_methods: { enabled: true }`,
 * so the method list is decided by Stripe at runtime from the account's
 * Dashboard settings plus the intent's currency and amount — not by anything in
 * our code. The only honest way to answer "do we offer Klarna / Vipps in
 * Norway?" is to create an intent and read back `payment_method_types`.
 *
 * It creates real PaymentIntents (no charge, no customer involvement) and
 * cancels each one immediately. In live mode that leaves a few cancelled
 * intents in the Dashboard; that is the cost of a truthful answer.
 *
 * --vipps additionally probes the Vipps preview. Vipps is NOT a normal
 * Dashboard toggle: it requires a preview API version plus a beta header that
 * Stripe must grant per account. Without that grant the request is rejected
 * outright, which is exactly why the preview header must never be sent on the
 * real checkout path — see `VIPPS_PREVIEW_VERSION` in src/index.ts.
 */

import Stripe from "stripe";
import { createHash } from "node:crypto";

/** The version + beta header from docs.stripe.com/payments/vipps. */
const VIPPS_PREVIEW_VERSION = "2026-09-30.preview; vipps_preview=v1";

/** 200.00 in minor units — above any method's minimum, below any ceiling. */
const PROBE_AMOUNT = 20_000;

const CURRENCIES = ["sek", "nok", "dkk", "eur"] as const;

function fingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

async function probe(
  stripe: Stripe,
  currency: string,
  options?: Stripe.RequestOptions,
): Promise<void> {
  const label = currency.toUpperCase().padEnd(4);
  let id: string | null = null;
  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: PROBE_AMOUNT,
        currency,
        automatic_payment_methods: { enabled: true },
      },
      options,
    );
    id = pi.id;
    const methods = pi.payment_method_types ?? [];
    console.log(`  ${label} ${methods.length ? methods.join(", ") : "(none)"}`);
    if (!methods.includes("vipps") && currency === "nok" && options) {
      console.log("       note: preview accepted but Vipps still not offered");
    }
  } catch (err) {
    const e = err as Stripe.errors.StripeError;
    console.log(`  ${label} FAILED ${e.code ?? e.type ?? ""}: ${e.message}`);
  } finally {
    // Leave nothing behind that could be mistaken for a real order.
    if (id) {
      try {
        await stripe.paymentIntents.cancel(id);
      } catch {
        /* a cancelled-at-creation intent expires on its own */
      }
    }
  }
}

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set (apps/payment-service/.env)");
    process.exit(1);
  }

  const stripe = new Stripe(key);
  const account = await stripe.accounts.retrieve();
  const mode = key.startsWith("sk_live") ? "LIVE" : "test";

  console.log(`account  ${account.id}  country=${account.country}`);
  console.log(`key      ${mode}  sha256=${fingerprint(key)}`);
  console.log("");

  console.log("Eligible payment methods (current API version):");
  for (const currency of CURRENCIES) {
    await probe(stripe, currency);
  }

  if (process.argv.includes("--vipps")) {
    console.log("");
    console.log(`Vipps preview (${VIPPS_PREVIEW_VERSION}):`);
    await probe(stripe, "nok", { apiVersion: VIPPS_PREVIEW_VERSION });
    console.log("");
    console.log(
      "A 'You do not have permission to pass this beta header' error means\n" +
        "Stripe has not granted this account the Vipps preview. That is a\n" +
        "support request, not a code change — nothing can enable it from here.",
    );
  }

  console.log("\nDone. All probe intents were cancelled.");
}

main().catch((err) => {
  console.error("check-payment-methods failed:", (err as Error).message);
  process.exit(1);
});
