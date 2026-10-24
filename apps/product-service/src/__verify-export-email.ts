/**
 * Renders the order confirmation for a Swedish and a Norwegian order and
 * checks the VAT line behaves differently.
 *
 * The bug: the VAT figure was `total * 0.2` with no country branch, so the
 * confirmation for the one real Norwegian order printed "Varav moms (25%)" in
 * NOK — Swedish VAT, on an export that carries none, denominated in the wrong
 * currency.
 *
 * Writes two HTML files so the result can be looked at, not just asserted.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@*\/node_modules/tsx/dist/cli.mjs \
 *     apps/product-service/src/__verify-export-email.ts <outDir>
 */

import fs from "node:fs";
import path from "node:path";
import { renderOrderConfirmationEmail } from "./email.js";

const outDir = process.argv[2] ?? ".";
fs.mkdirSync(outDir, { recursive: true });

/** money() formats with a non-breaking space (1 948 kr), so compare normalised. */
const flat = (html: string) => html.replace(/ /g, " ");

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
}

const base = {
  firstName: "Johan",
  lastName: "Berg",
  email: "kund@example.test",
  address: "Testgatan 1",
  city: "Göteborg",
  postalCode: "41117",
  servicePointName: "ICA Supermarket",
  deliveryOption: "servicepoint",
  paymentMethodDisplay: "Visa •••• 4242",
  locale: "sv" as const,
  items: [
    { productName: "TD04HL-19T Volvo 940", variant: null, price: 7596, quantity: 1 },
  ],
};

const swedish = renderOrderConfirmationEmail({
  ...base,
  orderNumber: "ORD-900",
  country: "SE",
  currency: "SEK",
  subtotal: 9495,
  shippingCost: 245,
  discount: 0,
  total: 9740,
  vatAmount: 1948,
  vatTreatment: "domestic",
});

const norwegian = renderOrderConfirmationEmail({
  ...base,
  orderNumber: "ORD-901",
  country: "NO",
  currency: "NOK",
  address: "Hauagata 17",
  city: "Sandnes",
  postalCode: "4307",
  subtotal: 7142,
  shippingCost: 762,
  discount: 0,
  total: 7904,
  vatAmount: 0,
  vatTreatment: "export_zero_rated",
});

fs.writeFileSync(path.join(outDir, "confirm-se.html"), swedish, "utf8");
fs.writeFileSync(path.join(outDir, "confirm-no.html"), norwegian, "utf8");
console.log(`wrote confirm-se.html and confirm-no.html to ${outDir}\n`);

check("SE shows a VAT line", swedish.includes("Varav moms"));
check("SE shows the stored amount, not a recomputed one", flat(swedish).includes("1 948 kr"));
check("SE has no export notice", !swedish.includes("exporteras"));

check("NO shows no VAT line anywhere (order total OR per line)", !norwegian.includes("Varav moms"));
check("NO explains why", norwegian.includes("exporteras"));
check("NO warns about duty on delivery", norwegian.includes("förtullningsavgift"));
check("NO is denominated in NOK", norwegian.includes("NOK"));

/** The old behaviour, as a regression guard. */
const wouldHaveBeen = Math.round(7904 * 0.2);
check(
  `NO does not print the phantom ${wouldHaveBeen} NOK of Swedish VAT`,
  !flat(norwegian).includes("1 581"),
  { wouldHaveBeen },
);

/** An older order with no stored VAT must still render what it charged. */
const legacy = renderOrderConfirmationEmail({
  ...base,
  orderNumber: "ORD-100",
  country: "SE",
  currency: "SEK",
  subtotal: 9495,
  shippingCost: 245,
  discount: 0,
  total: 9740,
});
check("legacy order with no stored VAT still shows a line", legacy.includes("Varav moms"));

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
