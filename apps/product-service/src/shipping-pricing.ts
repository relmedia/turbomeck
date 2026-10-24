/**
 * Shipping rates live in `@repo/shipping` — one copy, shared with the
 * storefront. This file used to hold a duplicate of those tiers kept aligned by
 * a "keep in sync" comment; since only this side decided what a customer was
 * actually charged, any drift billed a different price than checkout displayed.
 *
 * Re-exported rather than deleted so the many call sites in `order-pricing.ts`
 * and `index.ts` keep their existing import path.
 */
export {
  EU_COUNTRY_CODES,
  OVERSIZE_LENGTH_CM,
  POSTPAKET_OVERSIZE_FEE,
  RATES_LAST_UPDATED,
  getHomeDeliveryInternationalPrice,
  getHomeDeliveryPrice,
  getPostpaketInternationalPrice,
  getPostpaketPrice,
  getShippingPrice,
  isOversize,
  priceExcludingVat,
  vatFromGross,
  vatRateForCountry,
  vatTreatmentForCountry,
  type VatTreatment,
} from "@repo/shipping";
