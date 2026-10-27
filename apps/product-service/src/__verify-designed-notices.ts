/**
 * Checks the migrated shipping-notice designs end to end.
 *
 * Each seeded design is stored, resolved, and filled with the merge values a
 * real notice would carry — then asserted to contain the parcel's actual
 * details and no leftover tokens. This is the step that distinguishes
 * "migrated" from "twelve rows that mail a literal {{service_point}}".
 *
 * Two cases get specific attention because they are where a design that looks
 * right still sends something wrong:
 *
 *  - An order with NO service point. Every address line is a token, so a
 *    missing service point must leave clean empty space, never a stray comma.
 *  - The core-return reminder, which has no parcel of ours and therefore no
 *    tracking URL. A CTA pointing at an empty href is worse than no CTA, so
 *    the seed omits the button; this asserts it stayed omitted.
 *
 * Creates and deletes its own rows on a probe locale. Sends no mail.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --env-file=apps/product-service/.env \
 *     apps/product-service/src/__verify-designed-notices.ts
 */

import { db } from "@repo/database";
import { emailDesigns } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import {
  shippingNoticeMergeValues,
  SHIPPING_NOTICE_COPY,
  type ShippingNoticeData,
  type ShippingNoticeKind,
} from "./email-shipping-notices.js";
import { resolveActiveDesign, renderDesign, invalidateDesignCache } from "./email-designed.js";
import { seedTemplates } from "./email-designs-seed.js";
import { applyMergeTags } from "./email-merge-tags.js";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

/** A locale no real design uses, so live rows are never touched. */
const LOCALE = "zz_probe";

const PARCEL: ShippingNoticeData = {
  firstName: "Johan",
  email: "probe@example.test",
  orderNumber: "TM-2026-0999",
  trackingId: "00573132902028050319",
  servicePointName: "ICA Supermarket Backaplan",
  servicePointStreet: "Backaplan 2",
  servicePointPostalCode: "41705",
  servicePointCity: "Göteborg",
  coreReturnDeadline: new Date("2026-11-10T00:00:00Z"),
  locale: "sv",
};

const NOTICE_KINDS: ShippingNoticeKind[] = [
  "ready_for_pickup",
  "pickup_reminder_1",
  "pickup_reminder_2",
  "order_delivered",
  "core_return_reminder",
];

async function main() {
  await db.delete(emailDesigns).where(eq(emailDesigns.locale, LOCALE));

  const seeds = seedTemplates();
  check("the seed covers every notice plus the confirmation", seeds.length === 12, seeds.length);

  /**
   * Every seeded design must have a subject and a non-trivial design, or the
   * migration would create rows the resolver then refuses to use.
   */
  check(
    "every seed has a subject",
    seeds.every((s) => s.subject.trim().length > 0),
  );
  check(
    "every seed has rows",
    seeds.every((s) => ((s.design as { body: { rows: unknown[] } }).body.rows.length ?? 0) >= 5),
  );
  check(
    "every seed names its template and locale",
    seeds.every((s) => s.templateKey && (s.locale === "sv" || s.locale === "en")),
  );

  for (const kind of NOTICE_KINDS) {
    const seed = seeds.find((s) => s.templateKey === kind && s.locale === "sv");
    if (!seed) {
      check(`seed exists for ${kind}`, false);
      continue;
    }

    /**
     * The migration gets its HTML from the browser; here the design's text
     * blocks are concatenated instead, which carries the same tokens and copy
     * and is what these assertions are about.
     */
    const designHtml = designToHtml(seed.design);

    const [row] = await db
      .insert(emailDesigns)
      .values({
        name: `Probe ${kind}`,
        locale: LOCALE,
        templateKey: kind,
        subject: seed.subject,
        design: seed.design,
        html: designHtml,
        isActive: true,
      })
      .returning({ id: emailDesigns.id });

    invalidateDesignCache();
    const design = await resolveActiveDesign(kind, LOCALE);
    check(`${kind}: design resolves`, design?.id === row?.id);

    const values = shippingNoticeMergeValues(PARCEL, "sv", PARCEL.orderNumber);
    const out = renderDesign(design!, values, kind);
    check(`${kind}: renders`, out !== null);
    if (!out) continue;

    const { subject, html } = out;
    check(`${kind}: the order number reaches the subject`, subject.includes("TM-2026-0999"), subject);
    check(`${kind}: the copy's own subject survives`, subject.includes(SHIPPING_NOTICE_COPY[kind].sv.subject));
    check(`${kind}: the customer is greeted by name`, html.includes("Johan"));
    check(`${kind}: the order number is in the body`, html.includes("TM-2026-0999"));
    check(`${kind}: no tokens left`, !html.includes("{{"), html.match(/\{\{[^}]*\}\}/g) ?? undefined);
    check(`${kind}: the compiled lead copy is present`, html.includes(SHIPPING_NOTICE_COPY[kind].sv.lead));

    if (kind === "ready_for_pickup" || kind === "pickup_reminder_1" || kind === "pickup_reminder_2") {
      check(`${kind}: names the service point`, html.includes("ICA Supermarket Backaplan"));
      check(`${kind}: gives its address`, html.includes("Backaplan 2, 41705 Göteborg"));
      check(`${kind}: offers a real tracking link`, html.includes("00573132902028050319"));
    }

    if (kind === "core_return_reminder") {
      check("core return: states the deadline", html.includes("2026-11-10"));
      /** No parcel of ours to track, so no empty-href CTA. */
      check("core return: has no tracking link", !html.includes("postnord.se/"), undefined);
    }

    await db.delete(emailDesigns).where(eq(emailDesigns.locale, LOCALE));
  }

  /* ---- an order with no service point --------------------------------- */
  {
    const seed = seeds.find((s) => s.templateKey === "ready_for_pickup" && s.locale === "sv")!;
    const bare: ShippingNoticeData = {
      ...PARCEL,
      servicePointName: null,
      servicePointStreet: null,
      servicePointPostalCode: null,
      servicePointCity: null,
    };
    const values = shippingNoticeMergeValues(bare, "sv", bare.orderNumber);
    check("no service point: the address token is empty, not partial", values.scalars.service_point_address === "", values.scalars.service_point_address);

    const html = applyMergeTags(designToHtml(seed.design), values);
    /**
     * The failure to catch is a paragraph left holding only punctuation — the
     * shape "Backaplan 2, " collapsing to ", " when both halves are missing.
     * A comma elsewhere is fine: "Hej Johan," has one by design, which is why
     * this looks at whole paragraphs rather than searching for a comma.
     */
    const orphanParagraphs = [...html.matchAll(/<p[^>]*>(.*?)<\/p>/gsu)]
      .map((m) => (m[1] ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim())
      // Only punctuation and whitespace counts as orphaned. A lone emoji is
      // real content — the notices open with a badge — so symbols are kept.
      .filter((t) => t.length > 0 && /^[\p{P}\s]+$/u.test(t));
    check("no service point: no paragraph is left holding only punctuation", orphanParagraphs.length === 0, orphanParagraphs);
    check("no service point: still renders the rest", html.includes("Johan") && html.includes("TM-2026-0999"));
  }

  /* ---- English keeps its own wording ---------------------------------- */
  {
    const en = seeds.find((s) => s.templateKey === "ready_for_pickup" && s.locale === "en")!;
    const html = applyMergeTags(designToHtml(en.design), shippingNoticeMergeValues({ ...PARCEL, locale: "en" }, "en", PARCEL.orderNumber));
    check("the English design uses English copy", html.includes(SHIPPING_NOTICE_COPY.ready_for_pickup.en.lead));
    check("the English design is not Swedish", !html.includes(SHIPPING_NOTICE_COPY.ready_for_pickup.sv.lead));
  }

  const left = await db
    .select({ id: emailDesigns.id })
    .from(emailDesigns)
    .where(eq(emailDesigns.locale, LOCALE));
  check("cleaned up", left.length === 0);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

/**
 * The text and button content of a design, concatenated.
 *
 * Not a substitute for Unlayer's renderer — it produces no layout — but it
 * carries every token and every piece of copy, which is what the assertions
 * above inspect. Using it keeps this harness free of a browser.
 */
function designToHtml(design: Record<string, unknown>): string {
  const parts: string[] = [];
  const body = design.body as { rows: Array<{ columns: Array<{ contents: Array<Record<string, unknown>> }> }> };
  for (const row of body.rows) {
    for (const col of row.columns) {
      for (const content of col.contents) {
        const values = content.values as Record<string, unknown> | undefined;
        if (!values) continue;
        if (typeof values.text === "string") parts.push(values.text);
        const href = values.href as { values?: { href?: string } } | undefined;
        if (href?.values?.href) parts.push(`<a href="${href.values.href}">cta</a>`);
      }
    }
  }
  return parts.join("\n");
}

void main();
