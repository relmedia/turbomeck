/**
 * Mirrors `apps/client/src/lib/postnord.ts` shipping tiers so checkout totals can be recomputed server-side.
 * Keep in sync when PostNord business rates change.
 */

const POSTPAKET_PRICE_TIERS: Array<{ maxKg: number; price: number }> = [
  { maxKg: 1, price: 84 },
  { maxKg: 2, price: 116 },
  { maxKg: 3, price: 128 },
  { maxKg: 5, price: 152 },
  { maxKg: 10, price: 196 },
  { maxKg: 15, price: 236 },
  { maxKg: 20, price: 276 },
];

const POSTPAKET_OVERSIZE_FEE = 215;

export function getPostpaketPrice(weightKg: number, oversize = false): number {
  const w = Math.max(0.1, Math.ceil(weightKg));
  const tier = POSTPAKET_PRICE_TIERS.find((t) => w <= t.maxKg);
  const lastTier = POSTPAKET_PRICE_TIERS[POSTPAKET_PRICE_TIERS.length - 1];
  const base = tier?.price ?? lastTier?.price ?? 355;
  return base + (oversize ? POSTPAKET_OVERSIZE_FEE : 0);
}

const HOME_DELIVERY_PRICE_TIERS: Array<{ maxKg: number; price: number }> = [
  { maxKg: 1, price: 67 },
  { maxKg: 2, price: 99 },
  { maxKg: 3, price: 224 },
  { maxKg: 5, price: 272 },
  { maxKg: 10, price: 352 },
  { maxKg: 15, price: 424 },
  { maxKg: 20, price: 480 },
];

export function getHomeDeliveryPrice(weightKg: number, oversize = false): number {
  const w = Math.max(0.1, Math.ceil(weightKg));
  const tier = HOME_DELIVERY_PRICE_TIERS.find((t) => w <= t.maxKg);
  const lastTier = HOME_DELIVERY_PRICE_TIERS[HOME_DELIVERY_PRICE_TIERS.length - 1];
  const base = tier?.price ?? lastTier?.price ?? 480;
  return base + (oversize ? POSTPAKET_OVERSIZE_FEE : 0);
}

const POSTPAKET_EU_TIERS: Array<{ maxKg: number; price: number }> = [
  { maxKg: 1, price: 358 },
  { maxKg: 2, price: 403 },
  { maxKg: 3, price: 446 },
  { maxKg: 5, price: 536 },
  { maxKg: 10, price: 760 },
  { maxKg: 15, price: 984 },
  { maxKg: 20, price: 1207 },
];

const POSTPAKET_NON_EU_TIERS: Array<{ maxKg: number; price: number }> = [
  { maxKg: 1, price: 408 },
  { maxKg: 2, price: 453 },
  { maxKg: 3, price: 496 },
  { maxKg: 5, price: 586 },
  { maxKg: 10, price: 810 },
  { maxKg: 15, price: 1034 },
  { maxKg: 20, price: 1257 },
];

const EU_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES",
]);

export function getPostpaketInternationalPrice(weightKg: number, countryCode: string): number {
  const normalized = countryCode?.toUpperCase().trim() || "";
  if (normalized === "SE") return getPostpaketPrice(weightKg);

  const tiers = EU_COUNTRY_CODES.has(normalized) ? POSTPAKET_EU_TIERS : POSTPAKET_NON_EU_TIERS;
  const w = Math.max(0.1, Math.ceil(weightKg));
  const tier = tiers.find((t) => w <= t.maxKg);
  return tier?.price ?? tiers[tiers.length - 1]!.price;
}

export function getHomeDeliveryInternationalPrice(weightKg: number, countryCode: string): number {
  const base = getPostpaketInternationalPrice(weightKg, countryCode);
  const w = Math.max(0.1, Math.ceil(weightKg));
  const premium = w <= 5 ? 50 : w <= 10 ? 60 : 70;
  return base + premium;
}

const VAT_RATE = 0.25;

export function getShippingPrice(
  weightKg: number,
  countryCode: string,
  deliveryOption: "home" | "servicepoint",
): number {
  const cc = countryCode?.toUpperCase().trim() || "SE";
  const isServicePoint = deliveryOption === "servicepoint";

  let basePrice: number;
  if (cc === "SE") {
    basePrice = isServicePoint ? getPostpaketPrice(weightKg) : getHomeDeliveryPrice(weightKg);
  } else {
    basePrice = isServicePoint
      ? getPostpaketInternationalPrice(weightKg, cc)
      : getHomeDeliveryInternationalPrice(weightKg, cc);
  }

  return Math.round(basePrice * (1 + VAT_RATE));
}
