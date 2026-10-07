import {
  convertFromSek,
  currencyForCountry,
  formatAmount,
  normalizeCurrency,
  toMinorUnits,
} from "./index.js";
import { getSekRate, peekRateCache } from "./rate.js";

async function main() {
  let fail = 0;
  const check = (label: string, got: unknown, want: unknown) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fail += 1;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(got)}` +
        (ok ? "" : ` (want ${JSON.stringify(want)})`),
    );
  };

  console.log("--- country -> currency");
  check("NO", currencyForCountry("NO"), "NOK");
  check("no (lowercase)", currencyForCountry("no"), "NOK");
  check("SE", currencyForCountry("SE"), "SEK");
  check("DK", currencyForCountry("DK"), "DKK");
  check("FI (eurozone)", currencyForCountry("FI"), "EUR");
  check("DE (eurozone)", currencyForCountry("DE"), "EUR");
  // The whole reason the map lists the eurozone instead of the EU: these three
  // are EU members with their own currencies, and billing them in euro would
  // offer them the wrong local payment methods.
  check("PL (EU, not eurozone)", currencyForCountry("PL"), "SEK");
  check("CZ (EU, not eurozone)", currencyForCountry("CZ"), "SEK");
  check("US (unsupported) falls back", currencyForCountry("US"), "SEK");
  check("undefined falls back", currencyForCountry(undefined), "SEK");

  console.log("--- normalisation (DB / client input)");
  check("junk -> SEK", normalizeCurrency("usd"), "SEK");
  check("nok -> NOK", normalizeCurrency("nok"), "NOK");
  check("eur -> EUR", normalizeCurrency("eur"), "EUR");
  check("dkk -> DKK", normalizeCurrency("dkk"), "DKK");
  check("null -> SEK", normalizeCurrency(null), "SEK");

  console.log("--- conversion");
  check("SEK is identity", convertFromSek(7490, "SEK", 0.95), 7490);
  check("NOK rounds to whole", convertFromSek(7490, "NOK", 0.95438), 7148);
  check("DKK rounds to whole", convertFromSek(7490, "DKK", 0.66594), 4988);
  check("EUR keeps 2 decimals", convertFromSek(7490, "EUR", 0.08909), 667.28);
  check("shipping line (NOK)", convertFromSek(245, "NOK", 0.95438), 234);
  // Whole-euro rounding would make this 0 and Stripe would reject the intent.
  check("cheap item survives in EUR", convertFromSek(5, "EUR", 0.08909), 0.45);
  check("minor units for Stripe", toMinorUnits(7148), 714800);
  check("minor units with decimals", toMinorUnits(667.28), 66728);

  console.log("--- line sums must reconcile after rounding");
  const lines = [7490, 245, 1498];
  const nok = lines.map((l) => convertFromSek(l, "NOK", 0.95438));
  check("each NOK line rounded", nok, [7148, 234, 1430]);
  check(
    "NOK total is the sum of rounded lines",
    nok.reduce((a, b) => a + b, 0),
    8812,
  );
  // Compared in minor units, which is both exact integer arithmetic and the
  // form Stripe actually receives — summing the floats would leave the test at
  // the mercy of 822.5699999999999.
  const eur = lines.map((l) => convertFromSek(l, "EUR", 0.08909));
  check("each EUR line rounded", eur, [667.28, 21.83, 133.46]);
  check(
    "EUR total is the sum of rounded lines (minor units)",
    eur.map(toMinorUnits).reduce((a, b) => a + b, 0),
    82257,
  );

  console.log("--- formatting");
  // sv-SE groups thousands with U+00A0 (non-breaking space), not a plain
  // space. Asserting a normal space here passes nowhere and confuses everyone.
  const NB = "\u00a0";
  check("SEK sv", formatAmount(7490, "SEK"), `7${NB}490 kr`);
  check("NOK sv", formatAmount(7148, "NOK"), `7${NB}148 NOK`);
  check("NOK en", formatAmount(7148, "NOK", "en"), "7,148 NOK");
  // Not "4 988 kr": Danish and Swedish kroner share that symbol, so a Dane
  // could not tell which currency the charge was in.
  check("DKK sv", formatAmount(4988, "DKK"), `4${NB}988 DKK`);
  check("EUR sv", formatAmount(667.28, "EUR"), "667,28 €");
  check("EUR sv, thousands", formatAmount(4987.89, "EUR"), `4${NB}987,89 €`);
  check("EUR en", formatAmount(667.28, "EUR", "en"), "667.28 €");
  // A whole euro still shows its decimals, so a price list lines up.
  check("EUR whole amount keeps decimals", formatAmount(5, "EUR"), "5,00 €");

  console.log("--- live rates");
  const ranges: Array<["NOK" | "DKK" | "EUR", number, number]> = [
    ["NOK", 0.5, 2],
    ["DKK", 0.4, 1],
    ["EUR", 0.04, 0.2],
  ];
  for (const [currency, lo, hi] of ranges) {
    const live = await getSekRate(currency);
    const sane = live > lo && live < hi;
    if (!sane) fail += 1;
    console.log(`${sane ? "PASS" : "FAIL"}  SEK->${currency} = ${live}`);
  }
  check("SEK rate is 1", await getSekRate("SEK"), 1);
  check(
    "every rate cached after first call",
    Object.keys(peekRateCache()).sort(),
    ["DKK", "EUR", "NOK"],
  );

  console.log(fail === 0 ? "ALL PASS" : `${fail} FAILURE(S)`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
