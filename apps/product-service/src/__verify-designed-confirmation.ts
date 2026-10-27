/**
 * End-to-end check of a designed order confirmation.
 *
 * The claim under test is the one the whole feature rests on: an admin drops
 * tokens into the builder, and the email that reaches the customer carries
 * their real order — the products they bought, the totals they were charged —
 * with no tokens left behind and no invalid markup.
 *
 * Also asserts the fallbacks, because those are the safety net: with no usable
 * design, nothing changes and the compiled template still sends.
 *
 * Creates and deletes its own design row, on a probe locale so it can never
 * collide with a real one. Sends no mail.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --env-file=apps/product-service/.env \
 *     apps/product-service/src/__verify-designed-confirmation.ts
 */

import { db } from "@repo/database";
import { emailDesigns } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { orderConfirmationMergeValues, type OrderEmailData } from "./email.js";
import { resolveActiveDesign, renderDesign, invalidateDesignCache } from "./email-designed.js";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

const KEY = "order_confirmation";
/** A locale no real design can use, so this never touches live rows. */
const LOCALE = "zz_probe";

/**
 * A Norwegian export, deliberately: the currency suffix and the zero-rated
 * VAT are the two things a design would most easily get wrong, and the shop
 * has already mis-charged one Norwegian order over exactly this.
 */
const ORDER: OrderEmailData = {
  orderNumber: "TM-2026-0999",
  currency: "NOK",
  firstName: "Johan",
  lastName: "Berg",
  email: "probe@example.test",
  address: "Testveien 12",
  city: "Oslo",
  postalCode: "0150",
  country: "NO",
  servicePointName: "Posten Majorstuen",
  deliveryOption: "service_point",
  subtotal: 16990,
  shippingCost: 245,
  discount: 500,
  total: 16735,
  vatAmount: 0,
  vatTreatment: "export",
  trackingId: "00573132902028050319",
  locale: "sv",
  paymentMethodDisplay: "Visa 4242",
  items: [
    {
      productName: 'Turbo "GT" 2.0',
      productImage: null,
      variant: "Steg 2",
      price: 16490,
      quantity: 1,
    },
    {
      productName: "Intercooler & slangkit",
      productImage: null,
      variant: null,
      price: 250,
      quantity: 2,
    },
  ],
};

/** What a plausible design exports: tokens inside the editor's own markup. */
const DESIGN_HTML = `
<table><tr><td class="v-text-align">
  <p style="line-height:140%">Hej {{customer_first_name}} {{customer_last_name}},</p>
  <p style="line-height:140%">Tack för ditt köp! Order {{order_number}} ({{order_date}}).</p>
  <p style="line-height:140%">{{order_items}}</p>
  <p style="line-height:140%">{{order_totals}}</p>
  <p style="line-height:140%">Betalat med {{payment_method}}.</p>
  <p style="line-height:140%">Levereras till {{service_point}} — {{delivery_address}}</p>
  <p style="line-height:140%">{{next_steps}}</p>
  <p style="line-height:140%"><a href="{{tracking_url}}">Spåra {{tracking_number}}</a></p>
</td></tr></table>`;

async function main() {
  await db.delete(emailDesigns).where(eq(emailDesigns.locale, LOCALE));

  const [row] = await db
    .insert(emailDesigns)
    .values({
      name: "Probe – tack för ditt köp",
      locale: LOCALE,
      templateKey: KEY,
      subject: "Tack för ditt köp, {{customer_first_name}}! ({{order_number}})",
      design: { body: { rows: [] }, counters: {}, schemaVersion: 16 },
      html: DESIGN_HTML,
      isActive: true,
    })
    .returning({ id: emailDesigns.id });
  check("an active design can be stored", Boolean(row?.id));

  invalidateDesignCache();
  const design = await resolveActiveDesign(KEY, LOCALE);
  check("the active design is resolved", design?.id === row?.id);

  const values = orderConfirmationMergeValues(ORDER);
  const out = renderDesign(design!, values, KEY);
  check("it renders", out !== null);

  const { subject, html } = out!;

  /**
   * `toLocaleString("sv-SE")` groups thousands with a NO-BREAK SPACE (U+00A0),
   * which is correct for email and invisible in a test assertion. Comparing
   * against a normalised copy keeps the checks below readable without
   * pretending the real output uses a plain space.
   */
  const flat = html.replace(/\u00a0/gu, " ");

  // ---- subject ------------------------------------------------------------
  check(
    "the subject is filled",
    subject === "Tack för ditt köp, Johan! (TM-2026-0999)",
    subject,
  );

  // ---- the customer's own order ------------------------------------------
  check("the name is there", html.includes("Hej Johan Berg,"));
  check("the order number is there", html.includes("TM-2026-0999"));
  check(
    "both products are listed",
    html.includes("Turbo &quot;GT&quot; 2.0") && html.includes("Intercooler &amp; slangkit"),
  );
  check("a quoted product name is escaped, not markup", !html.includes('Turbo "GT"'));
  check("the variant is listed", html.includes("Steg 2"));
  check("quantities are rendered", html.includes("Antal: 2"));
  /** 250 x 2: the block multiplies, so a design never has to. */
  check("the line total multiplies by quantity", flat.includes("500 NOK"));

  // ---- money in the order's own currency ---------------------------------
  check("the total is rendered", flat.includes("16 735 NOK"));
  check("the subtotal is rendered", flat.includes("16 990 NOK"));
  check("the discount is negative", flat.includes("-500 NOK"));
  /** The order was charged in NOK, so nothing may read "kr" or "SEK". */
  check("nothing is labelled in the wrong currency", !flat.includes(" kr") && !flat.includes("SEK"));
  /** An export carries no Swedish VAT; the row must vanish, not read "0 kr". */
  check("an export shows no VAT row", !html.includes("Varav moms"));

  // ---- delivery -----------------------------------------------------------
  check("the service point is there", html.includes("Posten Majorstuen"));
  check("the address includes the country name", html.includes("Testveien 12, 0150 Oslo, Norge"));
  check(
    "the tracking link resolves to a real URL",
    /href="https:\/\/[^"]*00573132902028050319/.test(html),
  );

  // ---- the next-steps block ----------------------------------------------
  check(
    "the three steps are there",
    html.includes("Bekräftelse") && html.includes("Packning") && html.includes("Leverans"),
  );

  // ---- markup integrity ---------------------------------------------------
  check("no tokens survive", !html.includes("{{"), html.match(/\{\{[^}]*\}\}/g) ?? undefined);
  check("no block table is left inside a <p>", !/<p[^>]*>\s*<table/i.test(html));
  check(
    "scalar paragraphs keep their styling",
    html.includes('<p style="line-height:140%">Hej Johan Berg,</p>'),
  );

  // ---- the fallbacks ------------------------------------------------------
  await db.update(emailDesigns).set({ isActive: false }).where(eq(emailDesigns.id, row!.id));
  invalidateDesignCache();
  check(
    "deactivating falls back to the built-in template",
    (await resolveActiveDesign(KEY, LOCALE)) === null,
  );

  /** An activated design with an empty body must fall back, not mail blank. */
  await db
    .update(emailDesigns)
    .set({ isActive: true, html: "   " })
    .where(eq(emailDesigns.id, row!.id));
  invalidateDesignCache();
  check("an empty design body falls back too", (await resolveActiveDesign(KEY, LOCALE)) === null);

  /** As must one with no subject — a subjectless mail gets filed as spam. */
  await db
    .update(emailDesigns)
    .set({ html: DESIGN_HTML, subject: "" })
    .where(eq(emailDesigns.id, row!.id));
  invalidateDesignCache();
  const noSubject = await resolveActiveDesign(KEY, LOCALE);
  check(
    "a design with no subject renders null so the caller falls back",
    noSubject !== null && renderDesign(noSubject, values, KEY) === null,
  );

  /** A design for a different locale must not be picked up for this one. */
  invalidateDesignCache();
  check(
    "another locale is not borrowed",
    (await resolveActiveDesign(KEY, "zz_other")) === null,
  );

  await db.delete(emailDesigns).where(eq(emailDesigns.locale, LOCALE));
  const left = await db
    .select({ id: emailDesigns.id })
    .from(emailDesigns)
    .where(eq(emailDesigns.locale, LOCALE));
  check("cleaned up", left.length === 0);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
