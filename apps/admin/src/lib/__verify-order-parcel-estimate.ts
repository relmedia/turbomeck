import { summariseParcel } from "./order-parcel-estimate.js";

let fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(got)}` + (ok ? "" : ` (want ${JSON.stringify(want)})`));
};
const line = (o: Partial<Parameters<typeof summariseParcel>[0][number]> = {}) => ({
  productName: "Turbo", quantity: 1, weight: null, lengthCm: null, widthCm: null, heightCm: null, ...o,
});

console.log("--- weight summing");
check("single 6 kg", summariseParcel([line({ weight: 6 })]).weightKg, 6);
check("quantity multiplies", summariseParcel([line({ weight: 2.5, quantity: 3 })]).weightKg, 7.5);
check("two lines add", summariseParcel([line({ weight: 2 }), line({ weight: 3 })]).weightKg, 5);
check("rounds to 0.1", summariseParcel([line({ weight: 1.249 })]).weightKg, 1.2);

console.log("\n--- missing weights fall back to 1 kg/unit (same as order-pricing.ts)");
const mixed = summariseParcel([line({ weight: 6 }), line({ productName: "Packning", quantity: 2 })]);
check("6 + 2x1", mixed.weightKg, 8);
check("source", mixed.source, "products");
check("names the gap", mixed.missingWeights, ["Packning"]);
const none = summariseParcel([line(), line({ productName: "B" })]);
check("all missing -> fallback", none.source, "fallback");
check("…still sums", none.weightKg, 2);
check("zero weight treated as missing", summariseParcel([line({ weight: 0 })]).source, "fallback");
check("negative treated as missing", summariseParcel([line({ weight: -3 })]).source, "fallback");

console.log("\n--- clamped to PostNord's parcel limits");
check("over 35 clamps", summariseParcel([line({ weight: 50 })]).weightKg, 35);
check("many units clamp", summariseParcel([line({ weight: 10, quantity: 9 })]).weightKg, 35);
check("empty order -> 0.1 floor", summariseParcel([]).weightKg, 0.1);

console.log("\n--- oversize comes from @repo/shipping");
check("normal", summariseParcel([line({ weight: 6, lengthCm: 30 })]).oversize, false);
check("120 cm is not over", summariseParcel([line({ weight: 6, lengthCm: 120 })]).oversize, false);
check("121 cm is", summariseParcel([line({ weight: 6, lengthCm: 121 })]).oversize, true);
check("any line counts", summariseParcel([line({ weight: 1 }), line({ lengthCm: 180 })]).oversize, true);

console.log(fail === 0 ? "\nAll checks passed." : `\n${fail} FAILED.`);
process.exit(fail === 0 ? 0 : 1);
