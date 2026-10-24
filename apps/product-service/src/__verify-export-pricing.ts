/**
 * Prices the same cart to Sweden and to Norway and compares them.
 *
 * This is the end-to-end check that the export fix actually reaches the money:
 * the catalogue price, the shipping tier, the VAT decision and the stored
 * total all have to agree that a Norwegian sale carries no Swedish VAT.
 *
 * Read-only — it calls `resolveCheckoutOrder`, which only reads the catalogue.
 * No order is created.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@*\/node_modules/tsx/dist/cli.mjs \
 *     --env-file=apps/product-service/.env \
 *     apps/product-service/src/__verify-export-pricing.ts
 */

import { db } from "@repo/database";
import { products } from "@repo/database/schema";
import { gt } from "drizzle-orm";
import { resolveCheckoutOrder } from "./order-pricing.js";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const [p] = await db
    .select({ id: products.id, name: products.name, price: products.price })
    .from(products)
    .where(gt(products.stock, 0))
    .limit(1);

  if (!p) {
    console.error("No active product to price against.");
    process.exit(1);
  }
  console.log(`Pricing: ${p.name} @ ${p.price} (catalogue, VAT-inclusive)\n`);

  const cart = [{ productId: p.id, quantity: 1, variant: null }];
  const se = await resolveCheckoutOrder({
    items: cart,
    country: "SE",
    deliveryOption: "servicepoint",
    commitsCoreReturnWithin14: true,
  });
  const no = await resolveCheckoutOrder({
    items: cart,
    country: "NO",
    deliveryOption: "servicepoint",
  });

  if (!se.ok || !no.ok) {
    console.error("Pricing failed:", se.ok ? no : se);
    process.exit(1);
  }

  console.log("— Sweden —");
  console.log(`   subtotal ${se.subtotal} + shipping ${se.shipping} = ${se.total} ${se.currency}`);
  console.log(`   vat ${se.vatAmount} @ ${se.vatRate} (${se.vatTreatment})`);
  console.log("— Norway —");
  console.log(`   subtotal ${no.subtotal} + shipping ${no.shipping} = ${no.total} ${no.currency}`);
  console.log(`   vat ${no.vatAmount} @ ${no.vatRate} (${no.vatTreatment})\n`);

  check("SE is domestic", se.vatTreatment === "domestic");
  check("SE charges 25%", se.vatRate === 0.25);
  check("SE VAT is a fifth of the gross", se.vatAmount === Math.round(se.total * 0.2), {
    stored: se.vatAmount,
    fifth: Math.round(se.total * 0.2),
  });

  check("NO is a zero-rated export", no.vatTreatment === "export_zero_rated");
  check("NO charges no VAT", no.vatRate === 0);
  check("NO records zero VAT", no.vatAmount === 0);

  /**
   * The headline: the Norwegian customer must pay less, because they will pay
   * Norwegian import VAT on arrival instead. If these were equal, the fix
   * never reached the line prices.
   */
  const sub = se.subtotal - no.subtotal;
  check("NO goods are cheaper than SE goods", no.subtotal < se.subtotal, {
    se: se.subtotal,
    no: no.subtotal,
    difference: sub,
  });
  /**
   * Compared in the SAME currency. The Norwegian order is charged in NOK, so
   * the ex-VAT SEK figure has to be converted before it can be compared —
   * the first version of this assertion held 748 NOK against 796 SEK and
   * "failed" on an exchange rate.
   */
  const expectedNok = Math.round(Math.round(se.subtotal / 1.25) * no.fxRate);
  check(
    "NO goods are the SE goods with 25% taken out, converted to NOK",
    Math.abs(no.subtotal - expectedNok) <= 2,
    { no: no.subtotal, expectedNok, fxRate: no.fxRate },
  );

  /** Currency conversion is separate and must still work. */
  check("NO is charged in NOK", no.currency === "NOK", no.currency);
  check("SE is charged in SEK", se.currency === "SEK");

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
