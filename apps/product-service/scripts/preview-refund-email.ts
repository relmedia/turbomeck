/**
 * Render the refund email to HTML files so the template can be looked at
 * without sending anything.
 *
 *   pnpm --filter product-service preview-refund-email
 *
 * Writes one file per case into the OS temp dir and prints the paths. Nothing
 * is mailed and nothing touches the database.
 *
 * Runs with --env-file=.env on purpose: the header logo is resolved from
 * EMAIL_LOGO_URL / R2_PUBLIC_URL, and without them the template falls back to
 * a plain "T" badge. A preview that silently shows the fallback is worse than
 * no preview, because it looks like the real mail is missing its logo.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderRefundIssuedEmail } from "../src/email.js";

const cases = [
  {
    file: "refund-full-sv.html",
    label: "Full refund, SEK, Swedish",
    data: {
      firstName: "Emil",
      email: "emil.olesen97@gmail.com",
      orderNumber: "#258",
      currency: "SEK",
      refundAmount: 2985,
      isFullRefund: true,
      chargeKind: "full" as const,
      last4: "4242",
      locale: "sv" as const,
    },
  },
  {
    // The rounding case: formatMoney would show this as "124 kr".
    file: "refund-partial-sv.html",
    label: "Partial refund with ore, Swedish",
    data: {
      firstName: "Emil",
      email: "emil.olesen97@gmail.com",
      orderNumber: "#258",
      currency: "SEK",
      refundAmount: 123.5,
      isFullRefund: false,
      chargeKind: "deposit" as const,
      last4: "4242",
      locale: "sv" as const,
    },
  },
  {
    file: "refund-full-en.html",
    label: "Full refund, EUR, English",
    data: {
      firstName: "Anna",
      email: "anna@example.com",
      orderNumber: "#261",
      currency: "EUR",
      refundAmount: 267.25,
      isFullRefund: true,
      chargeKind: "balance" as const,
      last4: null,
      locale: "en" as const,
    },
  },
];

for (const c of cases) {
  const out = join(tmpdir(), c.file);
  writeFileSync(out, renderRefundIssuedEmail(c.data), "utf8");
  console.log(`${c.label.padEnd(34)} -> ${out}`);
}
