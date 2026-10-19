import {
  OVERSIZE_LENGTH_CM,
  POSTPAKET_OVERSIZE_FEE,
  getHomeDeliveryPrice,
  getPostpaketInternationalPrice,
  getPostpaketPrice,
  getShippingPrice,
  isOversize,
} from "./index.js";

function main() {
  let fail = 0;
  const check = (label: string, got: unknown, want: unknown) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fail += 1;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(got)}` +
        (ok ? "" : ` (want ${JSON.stringify(want)})`),
    );
  };

  console.log("--- tier lookup rounds UP to the next tier");
  check("0.1 kg -> 1 kg tier", getPostpaketPrice(0.1), 84);
  check("1 kg", getPostpaketPrice(1), 84);
  check("1.2 kg -> 2 kg tier", getPostpaketPrice(1.2), 116);
  check("6 kg -> 10 kg tier", getPostpaketPrice(6), 196);
  check("20 kg (last tier)", getPostpaketPrice(20), 276);
  check("above last tier clamps", getPostpaketPrice(999), 276);
  check("home delivery 3 kg", getHomeDeliveryPrice(3), 224);

  console.log("\n--- oversize surcharge (domestic only)");
  check("postpaket 6 kg normal", getPostpaketPrice(6), 196);
  check("postpaket 6 kg oversize", getPostpaketPrice(6, true), 196 + POSTPAKET_OVERSIZE_FEE);
  check("home 6 kg oversize", getHomeDeliveryPrice(6, true), 352 + POSTPAKET_OVERSIZE_FEE);
  // International tiers must NOT take the domestic surcharge — adding it there
  // would invent a charge PostNord does not make.
  check("DE is unaffected by oversize", getPostpaketInternationalPrice(6, "DE", true), 760);
  check("NO is unaffected by oversize", getPostpaketInternationalPrice(6, "NO", true), 810);
  // ...but SE routed through the international helper still gets it.
  check("SE via intl helper keeps it", getPostpaketInternationalPrice(6, "SE", true), 196 + 215);

  console.log("\n--- isOversize: longest side of ANY item decides");
  check("no items", isOversize([]), false);
  check("no dimensions recorded", isOversize([{}]), false);
  check("nulls only", isOversize([{ lengthCm: null, widthCm: null, heightCm: null }]), false);
  check("under threshold", isOversize([{ lengthCm: 120, widthCm: 30, heightCm: 30 }]), false);
  check("just over on length", isOversize([{ lengthCm: 121, widthCm: 30, heightCm: 30 }]), true);
  check("over on width counts too", isOversize([{ lengthCm: 30, widthCm: 150, heightCm: 30 }]), true);
  check(
    "one oversize item in a normal cart",
    isOversize([{ lengthCm: 30, widthCm: 25, heightCm: 25 }, { lengthCm: 180 }]),
    true,
  );
  check("NaN is ignored", isOversize([{ lengthCm: Number.NaN }]), false);
  check("threshold constant", OVERSIZE_LENGTH_CM, 120);

  console.log("\n--- getShippingPrice includes 25% VAT");
  check("SE servicepoint 6 kg", getShippingPrice(6, "SE", "servicepoint"), Math.round(196 * 1.25));
  check("SE home 6 kg", getShippingPrice(6, "SE", "home"), Math.round(352 * 1.25));
  check(
    "SE servicepoint 6 kg oversize",
    getShippingPrice(6, "SE", "servicepoint", true),
    Math.round((196 + 215) * 1.25),
  );
  check("default arg keeps old price", getShippingPrice(6, "SE", "servicepoint"), 245);
  check("empty country defaults to SE", getShippingPrice(6, "", "servicepoint"), 245);
  check("lowercase country", getShippingPrice(6, "se", "servicepoint"), 245);

  console.log(fail === 0 ? "\nAll checks passed." : `\n${fail} check(s) FAILED.`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
