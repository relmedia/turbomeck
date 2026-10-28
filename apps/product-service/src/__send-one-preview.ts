/**
 * Sends ONE real preview mail, to prove the transport end to end.
 *
 * Everything else about this feature is covered by pure harnesses; the one
 * thing they cannot show is that a mail leaves the building. Takes the
 * recipient as an argument so it is never possible to run it accidentally.
 *
 * Run:
 *   node ...tsx --env-file=apps/product-service/.env \
 *     apps/product-service/src/__send-one-preview.ts you@example.com [sv|en]
 */

import { seedTemplates } from "./email-designs-seed.js";
import { sendDesignPreview } from "./email-preview-fixtures.js";

const to = process.argv[2];
const locale = process.argv[3] === "en" ? "en" : "sv";
if (!to?.includes("@")) {
  console.error("usage: __send-one-preview.ts <recipient> [sv|en]");
  process.exit(1);
}

const seed = seedTemplates().find((t) => t.templateKey === "order_confirmation" && t.locale === locale)!;

/** The design's text content, standing in for Unlayer's rendered HTML. */
const body = (seed.design.body as { rows: Array<{ columns: Array<{ contents: Array<{ values?: { text?: string } }> }> }> })
  .rows.flatMap((r) => r.columns.flatMap((c) => c.contents.map((ct) => ct.values?.text ?? "")))
  .filter(Boolean)
  .join("\n");

const result = await sendDesignPreview({ to, subject: seed.subject, html: body, locale });
console.log("sent:", JSON.stringify(result));
process.exit(0);
