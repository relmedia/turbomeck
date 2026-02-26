/**
 * PostNord API integration
 * @see https://developer.postnord.com/apis/active
 * @see https://portal.postnord.com/se/sv/resurser/integrationer/api
 *
 * Get your API key at: https://developer.postnord.com
 */

export type PostNordServicePoint = {
  servicePointId: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  countryCode: string;
  latitude?: number;
  longitude?: number;
  openingHours?: string;
  distance?: number;
  routeDistance?: number;
};

export type PostNordServicePointsResponse = {
  servicepoints?: Array<{
    servicePointId?: string;
    name?: string;
    visitingAddress?: {
      streetName?: string;
      streetNumber?: string;
      postalCode?: string;
      city?: string;
      countryCode?: string;
    };
    coordinate?: {
      northing?: number;
      easting?: number;
      latitude?: number;
      longitude?: number;
    };
    openingHours?: Array<{ day?: string; from1?: string; to1?: string }>;
    routeDistance?: number;
  }>;
  servicepointinformation?: Array<Record<string, unknown>>;
};

/**
 * Fetch nearby PostNord service points (pickup points, parcel lockers) by coordinates.
 * Uses PostNord Business Location API v1.
 */
export async function getNearbyServicePoints(
  latitude: number,
  longitude: number,
  options?: {
    maxResults?: number;
    radius?: number;
    locale?: string;
  }
): Promise<PostNordServicePoint[]> {
  const apiKey = process.env.POSTNORD_API_KEY;
  if (!apiKey) {
    console.warn("POSTNORD_API_KEY not set - PostNord integration disabled");
    return [];
  }

  const { maxResults = 10, radius = 10000, locale = "sv" } = options ?? {};
  const url = new URL(
    "https://api2.postnord.com/rest/businesslocation/v1/pickuppoints/nearby.json"
  );
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("maxNo", String(maxResults));
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("locale", locale);
  url.searchParams.set("origin", "coord");
  url.searchParams.set("apikey", apiKey);

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!res.ok) {
    const text = await res.text();
    console.error("PostNord API error:", res.status, text);
    return [];
  }

  const data = await res.json();

  // Parse different response formats (API versions may vary)
  const points = data.servicepointinformation ?? data.pickuppoint ?? data.servicepoints ?? [];
  const list = Array.isArray(points) ? points : [points];

  return list
    .filter((p: Record<string, unknown>) => p?.servicepointId ?? p?.id)
    .map((p: Record<string, unknown>) => {
      const addr = (p.visitingAddress ?? p.address ?? p) as Record<string, unknown>;
      const coord = (p.coordinate ?? p) as Record<string, unknown>;
      return {
        servicePointId: String(p.servicepointId ?? p.servicePointId ?? p.id ?? ""),
        name: String(p.name ?? p.servicePointName ?? "PostNord ombud"),
        address: [
          addr.streetName,
          addr.streetNumber,
          addr.street ?? addr.addressLine1,
        ]
          .filter(Boolean)
          .join(" ")
          .trim() || String(addr.address ?? ""),
        postalCode: String(addr.postalCode ?? addr.postalcode ?? p.postalCode ?? ""),
        city: String(addr.city ?? p.city ?? ""),
        countryCode: String(addr.countryCode ?? p.countryCode ?? "SE"),
        latitude: Number(coord.latitude ?? coord.northing ?? 0) || undefined,
        longitude: Number(coord.longitude ?? coord.easting ?? 0) || undefined,
        openingHours: Array.isArray(p.openingHours)
          ? (p.openingHours as Array<{ day?: string; from1?: string; to1?: string }>)
              .map((h) => `${h.day}: ${h.from1}-${h.to1}`)
              .join(", ")
          : undefined,
        distance: Number(p.distance ?? p.routeDistance ?? 0) || undefined,
        routeDistance: Number(p.routeDistance ?? p.distance ?? 0) || undefined,
      };
    });
}

/**
 * Official PostNord Postpaket inrikes pricing (Sverige, hos ombud).
 * @see https://www.postnord.se/privat/priser-och-villkor/portotabeller/portotabell-paket/
 * Prices in SEK. Weight in kg. For weights between tiers, rounds up to next tier.
 */
const POSTPAKET_PRICE_TIERS: Array<{ maxKg: number; price: number }> = [
  { maxKg: 1, price: 115 },
  { maxKg: 2, price: 154 },
  { maxKg: 3, price: 170 },
  { maxKg: 5, price: 201 },
  { maxKg: 10, price: 257 },
  { maxKg: 15, price: 304 },
  { maxKg: 20, price: 355 },
];

/** Extra fee for parcels over 1.2m length (SEK) */
const POSTPAKET_OVERSIZE_FEE = 215;

/**
 * Get Postpaket price for given weight (kg).
 * Uses official PostNord Postpaket inrikes pricing.
 * @param weightKg Total parcel weight in kg
 * @param oversize Optional: parcel exceeds 1.2m length
 */
export function getPostpaketPrice(
  weightKg: number,
  oversize = false
): number {
  const w = Math.max(0.1, Math.ceil(weightKg));
  const tier = POSTPAKET_PRICE_TIERS.find((t) => w <= t.maxKg);
  const lastTier = POSTPAKET_PRICE_TIERS[POSTPAKET_PRICE_TIERS.length - 1];
  const base = tier?.price ?? lastTier?.price ?? 355;
  return base + (oversize ? POSTPAKET_OVERSIZE_FEE : 0);
}

/**
 * Get home delivery price (Hemleverans) - domestic Sweden only.
 * PostNord hemleverans typically costs ~20-40 kr more than Postpaket.
 */
export function getHomeDeliveryPrice(
  weightKg: number,
  oversize = false
): number {
  const postpaket = getPostpaketPrice(weightKg, oversize);
  const w = Math.max(0.1, Math.ceil(weightKg));
  const premium = w <= 5 ? 40 : w <= 10 ? 50 : 60;
  return postpaket + premium;
}

/**
 * PostNord Postpaket utrikes - EU countries.
 * @see https://www.postnord.se/privat/skicka/brev-och-paket/postpaket-utrikes/
 * @see https://www.postnord.se/privat/priser-och-villkor/portotabeller/
 * Prices in SEK. Weight in kg. Online/Skicka Direkt prices.
 */
const POSTPAKET_EU_TIERS: Array<{ maxKg: number; price: number }> = [
  { maxKg: 1, price: 358 },
  { maxKg: 2, price: 403 },
  { maxKg: 3, price: 446 },
  { maxKg: 5, price: 536 },
  { maxKg: 10, price: 760 },
  { maxKg: 15, price: 984 },
  { maxKg: 20, price: 1207 },
];

/**
 * PostNord Postpaket utrikes - countries outside EU.
 * Higher tier for Norway, Switzerland, UK, Iceland, etc.
 */
const POSTPAKET_NON_EU_TIERS: Array<{ maxKg: number; price: number }> = [
  { maxKg: 1, price: 408 },
  { maxKg: 2, price: 453 },
  { maxKg: 3, price: 496 },
  { maxKg: 5, price: 586 },
  { maxKg: 10, price: 810 },
  { maxKg: 15, price: 1034 },
  { maxKg: 20, price: 1257 },
];

/** EU member states (ISO 3166-1 alpha-2) - used for PostNord international pricing zone */
export const EU_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES",
]);

/**
 * Get Postpaket utrikes price for European destinations (excl. Sweden).
 * @param weightKg Parcel weight in kg
 * @param countryCode ISO 3166-1 alpha-2 (e.g. DE, NO)
 */
export function getPostpaketInternationalPrice(
  weightKg: number,
  countryCode: string
): number {
  const normalized = countryCode?.toUpperCase().trim() || "";
  if (normalized === "SE") return getPostpaketPrice(weightKg);

  const tiers = EU_COUNTRY_CODES.has(normalized)
    ? POSTPAKET_EU_TIERS
    : POSTPAKET_NON_EU_TIERS;
  const w = Math.max(0.1, Math.ceil(weightKg));
  const tier = tiers.find((t) => w <= t.maxKg);
  return tier?.price ?? tiers[tiers.length - 1]!.price;
}

/**
 * Get hemleverans (home delivery) price for European destinations.
 * International hemleverans: ~50 kr premium over Postpaket (estimate).
 */
export function getHomeDeliveryInternationalPrice(
  weightKg: number,
  countryCode: string
): number {
  const base = getPostpaketInternationalPrice(weightKg, countryCode);
  const w = Math.max(0.1, Math.ceil(weightKg));
  const premium = w <= 5 ? 50 : w <= 10 ? 60 : 70;
  return base + premium;
}

/**
 * Get shipping cost (SEK) for a given weight, country and delivery type.
 * Sweden uses domestic Postpaket/Hemleverans; other European countries use international tiers.
 */
export function getShippingPrice(
  weightKg: number,
  countryCode: string,
  deliveryOption: "home" | "servicepoint"
): number {
  const cc = countryCode?.toUpperCase().trim() || "SE";
  const isServicePoint = deliveryOption === "servicepoint";

  if (cc === "SE") {
    return isServicePoint
      ? getPostpaketPrice(weightKg)
      : getHomeDeliveryPrice(weightKg);
  }

  return isServicePoint
    ? getPostpaketInternationalPrice(weightKg, cc)
    : getHomeDeliveryInternationalPrice(weightKg, cc);
}

/**
 * Geocode Swedish postal code to coordinates using Nominatim (OpenStreetMap).
 * Used when we only have postal code from the shipping form.
 */
export async function geocodeSwedishPostalCode(
  postalCode: string,
  city?: string
): Promise<{ latitude: number; longitude: number } | null> {
  const query = city
    ? `${postalCode} ${city}, Sweden`
    : `${postalCode.replace(/\s/g, "")}, Sweden`;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "se");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "Turbomeck/1.0" },
    next: { revalidate: 86400 }, // Cache 24h - postal codes don't move
  });

  if (!res.ok) return null;
  const data = await res.json();
  const first = Array.isArray(data) ? data[0] : null;
  if (!first?.lat || !first?.lon) return null;

  return {
    latitude: parseFloat(first.lat),
    longitude: parseFloat(first.lon),
  };
}
