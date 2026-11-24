/**
 * Checks the admin's new-order alert as a designable template.
 *
 * Until now this mail was compiled-only: the shop could restyle every
 * customer email and not the one its own staff reads every day. Making it
 * designable means its tokens have to be fillable from the admin payload,
 * which is NOT the same payload the customer receipt uses — it has a phone
 * number and a studio link, and it has no VAT treatment.
 *
 * That last one is the trap worth asserting. The customer receipt assumes
 * 25 % included VAT; the admin payload cannot know whether the order was an
 * export, so stating a number would be a confident lie. It is blank, and the
 * totals block is asserted to drop the row rather than print "Varav moms: ".
 *
 * Pure — no database, no SMTP, no network.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     apps/product-service/src/__verify-admin-order-design.ts
 */

process.env.R2_PUBLIC_URL = "https://cdn.example.test";

import { adminNewOrderMergeValues, type AdminNewOrderEmailData } from "./email.js";
import { applyMergeTags, applyMergeTagsPlain, unknownTokens } from "./email-merge-tags.js";
import { seedTemplates } from "./email-designs-seed.js";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

const ORDER: AdminNewOrderEmailData = {
  orderNumber: "TM-2026-0042",
  orderId: 42,
  currency: "SEK",
  firstName: "Anna",
  lastName: "Lindqvist",
  email: "anna@example.se",
  phone: "070-123 45 67",
  address: "Storgatan 14",
  city: "Göteborg",
  postalCode: "41117",
  country: "SE",
  servicePointName: "ICA Backaplan",
  deliveryOption: "service_point",
  subtotal: 17240,
  shippingCost: 249,
  discount: 500,
  total: 16989,
  paymentMethodDisplay: "Visa •••• 4242",
  items: [
    {
      productName: "Turbo Garrett GT2860RS",
      productImage: "products/turbo.jpg",
      variant: "Steg 2",
      price: 16490,
      quantity: 1,
    },
    { productName: "Oljeslang", productImage: null, variant: null, price: 375, quantity: 2 },
  ],
};

const values = adminNewOrderMergeValues(ORDER);

/* ---- the values the shop needs ---------------------------------------- */
{
  check("the customer's phone is carried", values.scalars.customer_phone === "070-123 45 67");
  check(
    "the studio deep link points at the order",
    (values.scalars.admin_order_url ?? "").endsWith("/payments/42"),
    values.scalars.admin_order_url,
  );
  check("the order number is there", values.scalars.order_number === "TM-2026-0042");
  check("the total is formatted in the order's currency", /16\s989\s*kr/.test(values.scalars.order_total ?? ""), values.scalars.order_total);
  check("a discount is signed and non-empty", (values.scalars.order_discount ?? "").startsWith("-"), values.scalars.order_discount);

  /**
   * The payload has no vatTreatment, so a number here could be wrong on an
   * export order. Blank, and the totals block drops the row.
   */
  check("VAT is left blank rather than guessed", values.scalars.order_vat === "", values.scalars.order_vat);
  check(
    "so the totals block carries no VAT row",
    !(values.blocks.order_totals ?? "").includes("moms"),
  );
  check(
    "but it does carry subtotal and total",
    (values.blocks.order_totals ?? "").includes("Delsumma") &&
      (values.blocks.order_totals ?? "").includes("Totalt"),
  );

  /** Nothing is booked at order time; a dead tracking link is worse than none. */
  check("tracking is blank, not a dead link", values.scalars.tracking_url === "" && values.scalars.tracking_number === "");

  /**
   * An unfilled block token survives into the mail as literal text, and this
   * mail has no next steps to describe — so it must be present and empty.
   */
  check("next_steps is present and empty", values.blocks.next_steps === "");
}

/* ---- the products, images included ------------------------------------ */
{
  const items = values.blocks.order_items ?? "";
  check("both products are listed", items.includes("Turbo Garrett GT2860RS") && items.includes("Oljeslang"));
  check(
    "the product image reaches the admin mail too",
    items.includes('src="https://cdn.example.test/products/turbo.jpg"'),
    items.match(/<img[^>]*>/)?.[0],
  );
  check("the imageless line keeps the column aligned", (items.match(/width="64"/g) ?? []).length >= 2);
}

/* ---- the seeded design is fillable ------------------------------------ */
{
  const seeds = seedTemplates().filter((t) => t.templateKey === "admin_new_order");
  check("exactly one admin template is seeded", seeds.length === 1, seeds.length);

  const seed = seeds[0];
  check("and it is Swedish only", seed?.locale === "sv", seed?.locale);

  const text = designText(seed?.design as Record<string, unknown>);
  check("the seeded design uses the order_items block", text.includes("{{order_items}}"));
  check("and the studio link", text.includes("{{admin_order_url}}"));

  /** Every token it uses must be one this service can fill. */
  check(
    "the design uses no token the catalogue cannot fill",
    unknownTokens(text).length === 0,
    unknownTokens(text),
  );

  const filled = applyMergeTags(text, values);
  check("nothing is left unfilled after substitution", !filled.includes("{{"), filled.match(/\{\{[^}]*\}\}/g) ?? undefined);

  const subject = applyMergeTagsPlain(seed?.subject ?? "", values);
  check("the subject fills too", !subject.includes("{{") && subject.includes("TM-2026-0042"), subject);
  check("and names the customer, for an inbox list", subject.includes("Anna"), subject);
}

/** Text and link targets out of a design, the same shape the editor exports. */
function designText(design: Record<string, unknown>): string {
  const parts: string[] = [];
  const body = design?.body as
    | { rows?: Array<{ columns?: Array<{ contents?: Array<Record<string, unknown>> }> }> }
    | undefined;
  for (const row of body?.rows ?? []) {
    for (const col of row.columns ?? []) {
      for (const content of col.contents ?? []) {
        const v = content.values as Record<string, unknown> | undefined;
        if (!v) continue;
        if (typeof v.text === "string") parts.push(v.text);
        const href = v.href as { values?: { href?: string } } | undefined;
        if (href?.values?.href) parts.push(`<a href="${href.values.href}">cta</a>`);
      }
    }
  }
  return parts.join("\n");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
