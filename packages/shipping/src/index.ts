/**
 * PostNord shipping rates — the single source of truth for both the storefront
 * (which displays a price) and product-service (which decides what is charged).
 *
 * These numbers used to live twice: `apps/client/src/lib/postnord.ts` and
 * `apps/product-service/src/shipping-pricing.ts`, kept aligned by a comment
 * saying "keep in sync". Only the server copy decided what a customer actually
 * paid, so any drift between them showed one price at checkout and billed
 * another — silently, and in the shop's or the customer's favour at random.
 *
 * Why the rates are hardcoded at all: PostNord publishes no rate API. Their
 * catalogue is Delivery Options, Booking, Service Points, Shipping Tool and
 * Track Shipment — none of which prices a parcel. Business rates are negotiated
 * per customer, so there is no public tariff to query. The figures below come
 * from the agreement and have to be re-checked by hand when it changes; that is
 * what RATES_LAST_UPDATED is for.
 */

/** Bump whenever a tier below is edited. The only freshness signal there is. */
export const RATES_LAST_UPDATED = "2026-03-19";

type PriceTier = { maxKg: number; price: number };

/**
 * PostNord Postpaket inrikes (Sverige, hos ombud) — BUSINESS rates.
 * @see https://www.postnord.se/kop-frakt/tjanster?customerType=BUSINESS
 * Prices in SEK, ex VAT. For weights between tiers, rounds up to the next tier.
 */
const POSTPAKET_PRICE_TIERS: PriceTier[] = [
  { maxKg: 1, price: 84 },
  { maxKg: 2, price: 116 },
  { maxKg: 3, price: 128 },
  { maxKg: 5, price: 152 },
  { maxKg: 10, price: 196 },
  { maxKg: 15, price: 236 },
  { maxKg: 20, price: 276 },
];

/**
 * PostNord Hemleverans (Sverige) — BUSINESS rates.
 * Light parcels (1–2 kg) use "Skicka Hem"; 3 kg and up use "Home".
 * @see https://www.postnord.se/kop-frakt/tjanster?customerType=BUSINESS
 */
const HOME_DELIVERY_PRICE_TIERS: PriceTier[] = [
  { maxKg: 1, price: 67 },
  { maxKg: 2, price: 99 },
  { maxKg: 3, price: 224 },
  { maxKg: 5, price: 272 },
  { maxKg: 10, price: 352 },
  { maxKg: 15, price: 424 },
  { maxKg: 20, price: 480 },
];

/**
 * PostNord Postpaket utrikes — EU destinations.
 * NOTE: retail/private prices. Business rates may be lower.
 * @see https://www.postnord.se/privat/skicka/brev-och-paket/postpaket-utrikes/
 */
const POSTPAKET_EU_TIERS: PriceTier[] = [
  { maxKg: 1, price: 358 },
  { maxKg: 2, price: 403 },
  { maxKg: 3, price: 446 },
  { maxKg: 5, price: 536 },
  { maxKg: 10, price: 760 },
  { maxKg: 15, price: 984 },
  { maxKg: 20, price: 1207 },
];

/** Postpaket utrikes — outside the EU (Norway, Switzerland, UK, Iceland, …). */
const POSTPAKET_NON_EU_TIERS: PriceTier[] = [
  { maxKg: 1, price: 408 },
  { maxKg: 2, price: 453 },
  { maxKg: 3, price: 496 },
  { maxKg: 5, price: 586 },
  { maxKg: 10, price: 810 },
  { maxKg: 15, price: 1034 },
  { maxKg: 20, price: 1257 },
];

/** EU member states (ISO 3166-1 alpha-2) — the international pricing zone. */
export const EU_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES",
]);

/**
 * Countries the shop ships to, in Swedish, matching the list the storefront
 * offers at checkout (`EUROPEAN_COUNTRIES` in the client's PhoneInput, which
 * also carries dial codes and so stays separate). Sweden first, then the other
 * Nordics, then the rest alphabetically — the order the admin's country picker
 * renders them in.
 */
export const SHIPPING_COUNTRIES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "SE", name: "Sverige" },
  { code: "NO", name: "Norge" },
  { code: "DK", name: "Danmark" },
  { code: "FI", name: "Finland" },
  { code: "AT", name: "Österrike" },
  { code: "BE", name: "Belgien" },
  { code: "BG", name: "Bulgarien" },
  { code: "CH", name: "Schweiz" },
  { code: "CY", name: "Cypern" },
  { code: "CZ", name: "Tjeckien" },
  { code: "DE", name: "Tyskland" },
  { code: "EE", name: "Estland" },
  { code: "ES", name: "Spanien" },
  { code: "FR", name: "Frankrike" },
  { code: "GB", name: "Storbritannien" },
  { code: "GR", name: "Grekland" },
  { code: "HR", name: "Kroatien" },
  { code: "HU", name: "Ungern" },
  { code: "IE", name: "Irland" },
  { code: "IS", name: "Island" },
  { code: "IT", name: "Italien" },
  { code: "LT", name: "Litauen" },
  { code: "LU", name: "Luxemburg" },
  { code: "LV", name: "Lettland" },
  { code: "MT", name: "Malta" },
  { code: "NL", name: "Nederländerna" },
  { code: "PL", name: "Polen" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Rumänien" },
  { code: "SI", name: "Slovenien" },
  { code: "SK", name: "Slovakien" },
];

/** Which tier table a country prices against. */
export type ShippingZone = "domestic" | "eu" | "non-eu";

/**
 * The pricing zone a destination falls in. Useful for labelling a price in the
 * admin, where "Norge" alone does not explain why it costs what it does.
 */
export function shippingZone(countryCode: string): ShippingZone {
  const cc = countryCode?.toUpperCase().trim() || "";
  if (cc === "SE") return "domestic";
  return EU_COUNTRY_CODES.has(cc) ? "eu" : "non-eu";
}

/**
 * PostNord's public Track & Trace page for one shipment.
 *
 * The path is locale-specific. This lived as a hardcoded string in nine places
 * across three apps, and the three admin copies used the English path
 * (`/en/our-tools/track-and-trace`) while the storefront and every customer
 * email used the Swedish one — so clicking "Spåra" in the Swedish admin opened
 * an English page. One function, so the next copy cannot drift again.
 *
 * PostNord retired the Swedish path `/vara-verktyg/spara-din-forsandelse` and
 * serves a 404 for it — every "Spåra" link, in the admin and in all three
 * customer mails, landed on "Här finns inget att se". The replacement is
 * `/vara-verktyg/spara-brev-paket-och-pall`; `?shipmentId=` is unchanged, and
 * the English path still resolves. Both were checked against a live parcel.
 *
 * `locale` defaults to Swedish, which is what every existing call site wanted.
 * Pass "en" where an English-speaking customer is being linked.
 */
export function postNordTrackingUrl(trackingId: string, locale: "sv" | "en" = "sv"): string {
  const path =
    locale === "en"
      ? "https://www.postnord.se/en/our-tools/track-and-trace"
      : "https://www.postnord.se/vara-verktyg/spara-brev-paket-och-pall";
  return `${path}?shipmentId=${encodeURIComponent(trackingId)}`;
}

/** Surcharge for a parcel whose longest side exceeds OVERSIZE_LENGTH_CM (SEK). */
export const POSTPAKET_OVERSIZE_FEE = 215;

/** PostNord's oversize threshold: 1.2 m on the longest side. */
export const OVERSIZE_LENGTH_CM = 120;

/** Swedish VAT rate applied to the displayed shipping price. */
const VAT_RATE = 0.25;

function tierPrice(tiers: PriceTier[], weightKg: number, fallback: number): number {
  const w = Math.max(0.1, Math.ceil(weightKg));
  const tier = tiers.find((t) => w <= t.maxKg);
  const lastTier = tiers[tiers.length - 1];
  return tier?.price ?? lastTier?.price ?? fallback;
}

/**
 * Whether a parcel counts as oversize, from the dimensions of the items in it.
 *
 * Only the longest side of any single item matters: packing cannot shorten a
 * long part, so one oversize item makes the shipment oversize. Items with no
 * recorded dimensions contribute nothing — an unmeasured product must not
 * invent a surcharge.
 */
export function isOversize(
  items: Array<{ lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null }>,
): boolean {
  return items.some((item) =>
    [item.lengthCm, item.widthCm, item.heightCm].some(
      (cm) => typeof cm === "number" && Number.isFinite(cm) && cm > OVERSIZE_LENGTH_CM,
    ),
  );
}

/** Postpaket inrikes (hos ombud), ex VAT. */
export function getPostpaketPrice(weightKg: number, oversize = false): number {
  return tierPrice(POSTPAKET_PRICE_TIERS, weightKg, 355) + (oversize ? POSTPAKET_OVERSIZE_FEE : 0);
}

/** Hemleverans inrikes, ex VAT. */
export function getHomeDeliveryPrice(weightKg: number, oversize = false): number {
  return (
    tierPrice(HOME_DELIVERY_PRICE_TIERS, weightKg, 480) + (oversize ? POSTPAKET_OVERSIZE_FEE : 0)
  );
}

/**
 * Postpaket utrikes, ex VAT. Sweden falls through to the domestic tier.
 *
 * The oversize surcharge is a domestic Postpaket fee, so it is deliberately not
 * applied to international tiers — adding it there would be inventing a charge
 * PostNord does not make.
 */
export function getPostpaketInternationalPrice(
  weightKg: number,
  countryCode: string,
  oversize = false,
): number {
  const normalized = countryCode?.toUpperCase().trim() || "";
  if (normalized === "SE") return getPostpaketPrice(weightKg, oversize);

  const tiers = EU_COUNTRY_CODES.has(normalized) ? POSTPAKET_EU_TIERS : POSTPAKET_NON_EU_TIERS;
  return tierPrice(tiers, weightKg, tiers[tiers.length - 1]!.price);
}

/** Hemleverans utrikes, ex VAT — Postpaket plus a weight-banded premium. */
export function getHomeDeliveryInternationalPrice(
  weightKg: number,
  countryCode: string,
  oversize = false,
): number {
  const base = getPostpaketInternationalPrice(weightKg, countryCode, oversize);
  const w = Math.max(0.1, Math.ceil(weightKg));
  const premium = w <= 5 ? 50 : w <= 10 ? 60 : 70;
  return base + premium;
}

/**
 * Shipping cost in SEK **including 25% VAT** — what the customer sees and pays.
 *
 * `oversize` defaults to false so existing callers keep their current prices;
 * pass `isOversize(items)` to apply the surcharge where it is due.
 */
export function getShippingPrice(
  weightKg: number,
  countryCode: string,
  deliveryOption: "home" | "servicepoint",
  oversize = false,
): number {
  const cc = countryCode?.toUpperCase().trim() || "SE";
  const isServicePoint = deliveryOption === "servicepoint";

  const basePrice =
    cc === "SE"
      ? isServicePoint
        ? getPostpaketPrice(weightKg, oversize)
        : getHomeDeliveryPrice(weightKg, oversize)
      : isServicePoint
        ? getPostpaketInternationalPrice(weightKg, cc, oversize)
        : getHomeDeliveryInternationalPrice(weightKg, cc, oversize);

  return Math.round(basePrice * (1 + VAT_RATE));
}

/**
 * PostNord Track & Trace status model. Re-exported so consumers keep importing
 * from "@repo/shipping" — the package exposes a single entry point.
 */
export {
  POST_NORD_ITEM_STATUSES,
  TERMINAL_STATUSES,
  EXCEPTION_STATUSES,
  ORDER_STATUSES,
  isTerminal,
  isException,
  isAwaitingPickup,
  mapToOrderStatus,
  parseTrackingResponse,
  extractTrackingEvents,
  type PostNordItemStatus,
  type OrderStatus,
  type TrackingEvent,
  type ParsedTracking,
} from "./postnord-status";
