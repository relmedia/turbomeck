import {
  DISPLAY_CURRENCIES,
  SUPPORTED_CURRENCIES,
  convertFromSek,
  currencyForCountry,
  displayCurrencyForCountry,
  displayCurrencyForLanguage,
  formatAmount,
  isSupportedCurrency,
  normalizeCurrency,
  normalizeDisplayCurrency,
  toMinorUnits,
  type DisplayCurrencyCode,
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

  console.log("--- country -> CHARGE currency (narrow: what we can bill in)");
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
  check("GB cannot be charged in GBP", currencyForCountry("GB"), "SEK");
  check("BG joined the euro", currencyForCountry("BG"), "EUR");
  check("undefined falls back", currencyForCountry(undefined), "SEK");

  console.log("--- country -> DISPLAY currency (wide: what we can show)");
  // The bug this split fixes: a British visitor used to see Swedish kronor,
  // because display was riding on the charge map above.
  check("GB", displayCurrencyForCountry("GB"), "GBP");
  check("JE (Crown Dependency)", displayCurrencyForCountry("JE"), "GBP");
  check("DE", displayCurrencyForCountry("DE"), "EUR");
  check("US", displayCurrencyForCountry("US"), "USD");
  check("CH", displayCurrencyForCountry("CH"), "CHF");
  check("PL", displayCurrencyForCountry("PL"), "PLN");
  check("CZ", displayCurrencyForCountry("CZ"), "CZK");
  check("HU", displayCurrencyForCountry("HU"), "HUF");
  check("IS", displayCurrencyForCountry("IS"), "ISK");
  check("SE", displayCurrencyForCountry("SE"), "SEK");
  // null, not SEK: "no opinion" has to stay distinguishable from "uses SEK",
  // or the resolver can never fall through to its next signal.
  check("JP (unmapped) -> null", displayCurrencyForCountry("JP"), null);
  check("junk -> null", displayCurrencyForCountry("??"), null);
  check("undefined -> null", displayCurrencyForCountry(undefined), null);

  console.log("--- Accept-Language fallback (no country available)");
  const lang = displayCurrencyForLanguage;
  // Longest prefix wins, which is the whole point of the table's shape.
  check("en-GB", lang("en-GB,en;q=0.9"), "GBP");
  check("en-US", lang("en-US,en;q=0.9"), "USD");
  check("de-CH beats de", lang("de-CH,de;q=0.9"), "CHF");
  check("de-DE falls to the de rule", lang("de-DE,de;q=0.9"), "EUR");
  check("da-DK", lang("da-DK,da;q=0.9"), "DKK");
  check("cs-CZ", lang("cs-CZ"), "CZK");
  // Bare "en" must stay unanswered: it says nothing about where the reader is,
  // and only the first tag counts — the rest are languages, not locations.
  check("bare en -> null", lang("en"), null);
  check("en;q with no region -> null", lang("en;q=0.8,sv;q=0.5"), null);
  check("empty -> null", lang(""), null);
  check("null -> null", lang(null), null);

  console.log("--- the two layers must not leak into each other");
  // Every charge currency must also be displayable, or an order could not be
  // rendered. The reverse must NOT hold.
  const chargeNotDisplayable = SUPPORTED_CURRENCIES.filter(
    (c) => !(DISPLAY_CURRENCIES as readonly string[]).includes(c),
  );
  check("every charge currency is displayable", chargeNotDisplayable, []);
  check(
    "display-only codes are rejected by the charge guard",
    DISPLAY_CURRENCIES.filter((c) => isSupportedCurrency(c)),
    ["SEK", "NOK", "DKK", "EUR"],
  );
  // A display code reaching the charge path is a bug upstream; SEK (no
  // conversion) is the safe answer rather than passing GBP to Stripe.
  check("normalizeCurrency rejects GBP", normalizeCurrency("GBP"), "SEK");
  check("normalizeDisplayCurrency accepts GBP", normalizeDisplayCurrency("gbp"), "GBP");
  check("normalizeDisplayCurrency rejects JPY", normalizeDisplayCurrency("JPY"), "SEK");

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

  console.log("--- formatting follows the CURRENCY, not the page language");
  // The regression that started this: a British visitor saw "£567,07",
  // because the number was formatted with the Swedish site language. Grouping
  // and decimal marks belong to the currency, so one amount now renders
  // identically for every reader.
  // Separator characters taken from ICU, not guessed: sv-SE, cs-CZ, hu-HU and
  // pl-PL group with a no-break space, fr-FR with a NARROW one, de-CH with an
  // apostrophe. Asserting a plain space would fail everywhere.
  const NB = " ";
  const NNB = " ";
  const APO = "’";

  check("SEK is spelled out", formatAmount(7490, "SEK"), `7${NB}490 SEK`);
  check("NOK", formatAmount(7148, "NOK"), `7${NB}148 NOK`);
  // Not "4 988 kr": Danish, Norwegian and Icelandic kroner all share that
  // symbol with SEK, so a Dane could not tell what they were charged.
  check("DKK groups with a dot (da-DK)", formatAmount(4988, "DKK"), "4.988 DKK");
  check("EUR", formatAmount(667.28, "EUR"), "667,28 €");
  check("EUR, thousands", formatAmount(4987.89, "EUR"), `4${NNB}987,89 €`);
  // A whole euro keeps its decimals so a price list lines up.
  check("EUR whole amount keeps decimals", formatAmount(5, "EUR"), "5,00 €");
  // Symbol before the number, and a decimal POINT: the assertion that would
  // have caught the original bug.
  check("GBP", formatAmount(567.07, "GBP"), "£567.07");
  check("GBP, thousands", formatAmount(1567.07, "GBP"), "£1,567.07");
  check("USD", formatAmount(745.9, "USD"), "$745.90");
  check("CHF groups with an apostrophe", formatAmount(1624.41, "CHF"), `1${APO}624.41 CHF`);
  // Polish typography does not group a four-digit number, so a 7 490 kr turbo
  // is "2924,55 zl" with no separator at all. Deliberate, not a bug.
  check("PLN, four digits ungrouped", formatAmount(2924.55, "PLN"), "2924,55 zł");
  check("PLN, five digits grouped", formatAmount(12924.55, "PLN"), `12${NB}924,55 zł`);
  check("CZK, no decimals", formatAmount(16300, "CZK"), `16${NB}300 Kč`);
  check("HUF, no decimals", formatAmount(244742, "HUF"), `244${NB}742 Ft`);
  check("RON", formatAmount(1476.3, "RON"), "1.476,30 lei");
  check("ISK is spelled out", formatAmount(91423, "ISK"), "91.423 ISK");

  console.log("--- every display currency must be quotable");
  // A currency the FX source cannot quote would silently serve the hardcoded
  // fallback forever, so this asserts the whole list, not just the charge four.
  const ranges: Array<[DisplayCurrencyCode, number, number]> = [
    ["NOK", 0.5, 2],
    ["DKK", 0.4, 1],
    ["EUR", 0.04, 0.2],
    ["GBP", 0.03, 0.2],
    ["USD", 0.04, 0.3],
    ["CHF", 0.03, 0.2],
    ["PLN", 0.2, 0.8],
    ["CZK", 1, 4],
    ["HUF", 15, 60],
    ["RON", 0.2, 1],
    ["ISK", 5, 25],
  ];
  for (const [currency, lo, hi] of ranges) {
    const live = await getSekRate(currency);
    const sane = live > lo && live < hi;
    if (!sane) fail += 1;
    console.log(`${sane ? "PASS" : "FAIL"}  SEK->${currency} = ${live}`);
  }
  check("SEK rate is 1", await getSekRate("SEK"), 1);
  check(
    "every non-base display currency is cached",
    Object.keys(peekRateCache()).sort(),
    DISPLAY_CURRENCIES.filter((c) => c !== "SEK")
      .slice()
      .sort(),
  );

  console.log(fail === 0 ? "ALL PASS" : `${fail} FAILURE(S)`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
