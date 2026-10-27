/**
 * Renders the order confirmation with a realistic multi-item order so the
 * "tack för ditt köp" mail can be looked at rather than described.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@*\/node_modules/tsx/dist/cli.mjs \
 *     --env-file=apps/product-service/.env \
 *     apps/product-service/src/__verify-confirmation-render.ts <outDir>
 */
import fs from "node:fs";
import path from "node:path";
import { renderOrderConfirmationEmail } from "./email.js";

const outDir = process.argv[2] ?? ".";
fs.mkdirSync(outDir, { recursive: true });

const html = renderOrderConfirmationEmail({
  orderNumber: "ORD-912",
  currency: "SEK",
  firstName: "Johan",
  lastName: "Berg",
  email: "kund@example.test",
  address: "Testgatan 12",
  city: "Göteborg",
  postalCode: "41117",
  country: "SE",
  servicePointName: "ICA Supermarket Backaplan",
  deliveryOption: "servicepoint",
  subtotal: 16990,
  shippingCost: 245,
  discount: 500,
  total: 16735,
  vatAmount: 3347,
  vatTreatment: "domestic",
  paymentMethodDisplay: "Visa •••• 4242",
  locale: "sv",
  items: [
    { productName: "TD04HL-19T Volvo 940", variant: null, price: 7495, quantity: 1 },
    { productName: "22T Volvo 940/740", variant: "Steg 2", price: 8995, quantity: 1 },
    { productName: "Packningssats", variant: null, price: 500, quantity: 1 },
  ],
});

const f = path.join(outDir, "order-confirmation.html");
fs.writeFileSync(f, html, "utf8");
console.log(`wrote ${f} (${html.length} bytes)`);
for (const marker of ["Tack för din beställning", "Beställda produkter", "Vad händer nu", "Packning", "Leverans", "Delsumma", "Totalt", "Utlämningsställe"]) {
  console.log(`  ${html.includes(marker) ? "present" : "MISSING"}  ${marker}`);
}
