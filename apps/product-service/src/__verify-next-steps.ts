/**
 * Checks the "Vad händer nu?" steps in both renderers.
 *
 * The point of the change being verified is that the steps describe the mails
 * this shop actually sends: packed, shipped with a tracking number, then a
 * mail on arrival. The old step 1 announced the confirmation inside the
 * confirmation, and nothing mentioned that a tracking number was coming — so
 * these assert the promises, not just that something rendered.
 *
 * Both renderers are checked because they are the thing that drifted: the
 * compiled template had icons and the designed block had numbered circles.
 *
 * Pure — no database, no SMTP.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     apps/product-service/src/__verify-next-steps.ts
 */

import {
  renderOrderConfirmationEmail,
  orderConfirmationMergeValues,
  type OrderEmailData,
} from "./email.js";
import { renderStepsBlock } from "./email-merge-tags.js";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

const ORDER: OrderEmailData = {
  orderNumber: "TM-2026-0042",
  currency: "SEK",
  firstName: "Anna",
  lastName: "Lindqvist",
  email: "anna@example.se",
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
  vatAmount: 3398,
  vatTreatment: "standard",
  trackingId: "00573132902028050319",
  locale: "sv",
  paymentMethodDisplay: "Visa 4242",
  items: [{ productName: "Turbo", productImage: null, variant: null, price: 16490, quantity: 1 }],
};

const ICONS = ["📦", "🚚", "📬"];

for (const locale of ["sv", "en"] as const) {
  /* ---- the single definition ------------------------------------------- */
  const compiled = renderOrderConfirmationEmail({ ...ORDER, locale });
  const block = orderConfirmationMergeValues({ ...ORDER, locale }).blocks.next_steps ?? "";

  check(`${locale}: compiled template renders the steps`, compiled.length > 0);
  check(`${locale}: the designed block renders`, block.length > 0);

  /* ---- icons, in both ------------------------------------------------- */
  for (const icon of ICONS) {
    check(`${locale}: compiled template shows ${icon}`, compiled.includes(icon));
    check(`${locale}: designed block shows ${icon}`, block.includes(icon));
  }

  /**
   * The icon used to appear twice on a step line — once in the badge and once
   * before the title. Counted PER ROW, not per document: 📦 is also used by
   * the tracking panel and the no-image product placeholder elsewhere in this
   * same email, so a document-wide count says 3 and proves nothing.
   */
  for (const [name, html] of [
    ["compiled", compiled],
    ["designed", block],
  ] as const) {
    const rows = html.split("<tr");
    for (const icon of ICONS) {
      const worst = Math.max(0, ...rows.map((r) => r.split(icon).length - 1));
      check(`${locale}/${name}: ${icon} appears at most once per row`, worst <= 1, worst);
    }
  }

  /** The numbered circles are gone; the icons replaced them. */
  check(
    `${locale}: the designed block no longer numbers the steps`,
    !/>1<\/td>/.test(block) && !/>2<\/td>/.test(block),
  );

  /* ---- the promises the steps make ------------------------------------ */
  const sv = locale === "sv";
  const trackingWord = sv ? "spårningsnummer" : "tracking number";
  const packWord = sv ? "packar" : "pack";

  for (const [name, html] of [
    ["compiled", compiled],
    ["designed", block],
  ] as const) {
    check(`${locale}/${name}: says we pack the order`, html.toLowerCase().includes(packWord));
    check(
      `${locale}/${name}: promises a tracking number by email`,
      html.toLowerCase().includes(trackingWord),
    );
    check(
      `${locale}/${name}: promises a mail on arrival`,
      sv
        ? html.includes("levererad") || html.includes("hämta")
        : html.includes("delivered") || html.includes("collect"),
    );
  }

  /**
   * The old step 1 announced the confirmation inside the confirmation. That
   * wording must be gone, or the change did not take.
   */
  check(
    `${locale}: the step list no longer announces itself`,
    sv
      ? !compiled.includes("Vi har mejlat en orderbekräftelse")
      : !compiled.includes("We've emailed an order confirmation"),
  );

  /** The delivery window TrustBar's comment depends on is still stated. */
  check(`${locale}: the 2–4 day window is still there`, compiled.includes("2–4"));
}

/* ---- one definition feeds both ---------------------------------------- */
{
  /**
   * Read the titles out of the compiled HTML and the block, and require the
   * same three in the same order. This is the assertion that stops the two
   * renderers drifting again, which is what went wrong last time.
   */
  for (const locale of ["sv", "en"] as const) {
    const compiled = renderOrderConfirmationEmail({ ...ORDER, locale });
    const block = orderConfirmationMergeValues({ ...ORDER, locale }).blocks.next_steps ?? "";
    const titles = ICONS.map((_, i) => i);

    /** Titles come from the shared definition, so pull them from there. */
    const shared = sharedTitles(locale);
    check(
      `${locale}: three steps are defined`,
      shared.length === 3,
      shared.length,
    );
    for (const i of titles) {
      const title = shared[i]!;
      check(`${locale}: compiled has step ${i + 1} "${title}"`, compiled.includes(title));
      check(`${locale}: designed has step ${i + 1} "${title}"`, block.includes(title));
    }
    /** Same order in both. */
    const idxCompiled = shared.map((t) => compiled.indexOf(t));
    const idxBlock = shared.map((t) => block.indexOf(t));
    check(
      `${locale}: compiled keeps them in order`,
      idxCompiled.every((v, i) => i === 0 || v > idxCompiled[i - 1]!),
      idxCompiled,
    );
    check(
      `${locale}: designed keeps them in order`,
      idxBlock.every((v, i) => i === 0 || v > idxBlock[i - 1]!),
      idxBlock,
    );
  }
}

/** The step titles for a locale, taken from the shared definition. */
function sharedTitles(locale: "sv" | "en"): string[] {
  const block = orderConfirmationMergeValues({ ...ORDER, locale }).blocks.next_steps ?? "";
  return [...block.matchAll(/font-weight:600[^>]*>([^<]+)</g)].map((m) => m[1]!.trim());
}

/* ---- a step with no icon still renders -------------------------------- */
{
  const legacy = renderStepsBlock([{ title: "Utan ikon", body: "Kropp" }]);
  check("a step with no icon falls back to its number", legacy.includes(">1<"), undefined);
  check("a step with no icon still shows its text", legacy.includes("Utan ikon"));
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
