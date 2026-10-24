/**
 * Asserts that a sale outside the EU carries no Swedish VAT.
 *
 * The bug this locks down: `getShippingPrice` ended in an unconditional
 * `* 1.25`, so a Norwegian buyer paid Swedish VAT on the freight and then
 * Norwegian import VAT plus a clearance fee on arrival — taxed twice on the
 * same parcel, while the shop over-collected output VAT on a sale that owed
 * none. `shippingZone()` already returned "non-eu" for NO; only the VAT step
 * ignored it.
 *
 * Pure — no network, no database.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@*\/node_modules/tsx/dist/cli.mjs \
 *     packages/shipping/src/__verify-export-vat.ts
 */

import {
  getShippingPrice,
  getPostpaketInternationalPrice,
  getPostpaketPrice,
  shippingZone,
  vatTreatmentForCountry,
  vatRateForCountry,
  priceExcludingVat,
  vatFromGross,
  VAT_RATE,
} from "./index";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
}

console.log("— treatment by destination —");
check("SE -> domestic", vatTreatmentForCountry("SE") === "domestic");
check("DE -> eu_b2c", vatTreatmentForCountry("DE") === "eu_b2c");
check("NO -> export_zero_rated", vatTreatmentForCountry("NO") === "export_zero_rated");
check("CH -> export_zero_rated", vatTreatmentForCountry("CH") === "export_zero_rated");
check("GB -> export_zero_rated", vatTreatmentForCountry("GB") === "export_zero_rated");
check("NO rate is 0", vatRateForCountry("NO") === 0);
check("SE rate is 0.25", vatRateForCountry("SE") === VAT_RATE);
check("lowercase 'no' works too", vatTreatmentForCountry("no") === "export_zero_rated");

console.log("\n— shipping price —");
const W = 6;
const seTier = getPostpaketPrice(W);
const noTier = getPostpaketInternationalPrice(W, "NO");

const sePrice = getShippingPrice(W, "SE", "servicepoint");
const noPrice = getShippingPrice(W, "NO", "servicepoint");
const dePrice = getShippingPrice(W, "DE", "servicepoint");

check("SE still carries VAT", sePrice === Math.round(seTier * 1.25), { sePrice, seTier });
check("DE still carries VAT (EU B2C distance selling)", dePrice === Math.round(getPostpaketInternationalPrice(W, "DE") * 1.25));
check("NO equals the ex-VAT tier exactly", noPrice === noTier, { noPrice, noTier });
check("NO is NOT the old 1.25x figure", noPrice !== Math.round(noTier * 1.25), {
  now: noPrice,
  before: Math.round(noTier * 1.25),
  overchargedBy: Math.round(noTier * 1.25) - noPrice,
});
check("zone unchanged: NO is still non-eu", shippingZone("NO") === "non-eu");

console.log("\n— stripping VAT from VAT-inclusive prices —");
/**
 * Product prices are stored gross. An export price is the stored price with
 * the VAT taken back OUT — not the stored price with no VAT added, which
 * would leave the 25% silently inside it.
 */
check("9495 incl. VAT -> 7596 ex VAT", priceExcludingVat(9495) === 7596, priceExcludingVat(9495));
check("round trip: ex * 1.25 ~= gross", Math.round(priceExcludingVat(9495) * 1.25) === 9495);
check("VAT share of 9495 gross is 1899 (a fifth, not a quarter)", vatFromGross(9495) === 1899, vatFromGross(9495));
check("ex + vat == gross", priceExcludingVat(9495) + vatFromGross(9495) === 9495);
check("zero-rate yields no VAT", vatFromGross(9495, 0) === 0);

console.log("\n— the order already in the database —");
/**
 * TM-2026-0001: Sandnes NO, 9495 goods + 810 shipping = 10305 charged.
 * The shipping line was the raw ex-VAT non-EU tier, so only the goods carried
 * the embedded Swedish VAT.
 */
const oldGoods = 9495;
const embedded = vatFromGross(oldGoods);
check("Swedish VAT wrongly embedded in that sale", embedded === 1899, { embedded });
console.log(`       -> ~${embedded} SEK of Swedish VAT was charged on a zero-rated export`);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
