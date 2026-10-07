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
  check("DE (unsupported) falls back", currencyForCountry("DE"), "SEK");
  check("undefined falls back", currencyForCountry(undefined), "SEK");

  console.log("--- normalisation (DB / client input)");
  check("junk -> SEK", normalizeCurrency("usd"), "SEK");
  check("nok -> NOK", normalizeCurrency("nok"), "NOK");
  check("null -> SEK", normalizeCurrency(null), "SEK");

  console.log("--- conversion");
  check("SEK is identity", convertFromSek(7490, "SEK", 0.95), 7490);
  check("NOK rounds to whole", convertFromSek(7490, "NOK", 0.95438), 7148);
  check("shipping line", convertFromSek(245, "NOK", 0.95438), 234);
  check("minor units for Stripe", toMinorUnits(7148), 714800);

  console.log("--- line sums must reconcile after rounding");
  const rate = 0.95438;
  const lines = [7490, 245, 1498];
  const converted = lines.map((l) => convertFromSek(l, "NOK", rate));
  const sumOfConverted = converted.reduce((a, b) => a + b, 0);
  check("each line rounded", converted, [7148, 234, 1430]);
  check("total is the sum of rounded lines", sumOfConverted, 8812);

  console.log("--- formatting");
  // sv-SE groups thousands with U+00A0 (non-breaking space), not a plain
  // space. Asserting a normal space here passes nowhere and confuses everyone.
  const NB = " ";
  check("SEK sv", formatAmount(7490, "SEK"), `7${NB}490 kr`);
  check("NOK sv", formatAmount(7148, "NOK"), `7${NB}148 NOK`);
  check("NOK en", formatAmount(7148, "NOK", "en"), "7,148 NOK");

  console.log("--- live rate");
  const live = await getSekRate("NOK");
  const sane = live > 0.5 && live < 2;
  if (!sane) fail += 1;
  console.log(`${sane ? "PASS" : "FAIL"}  SEK->NOK = ${live}`);
  check("SEK rate is 1", await getSekRate("SEK"), 1);
  const cached = Object.keys(peekRateCache());
  check("rate cached after first call", cached, ["NOK"]);

  console.log(fail === 0 ? "ALL PASS" : `${fail} FAILURE(S)`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
