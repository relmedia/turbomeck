/**
 * PostNord API integration
 * @see https://developer.postnord.com/apis/details/6wEaIYIBudeJHEJmhxLu
 * @see https://developer.postnord.com/apis/active
 * @see https://portal.postnord.com/se/sv/resurser/integrationer/api
 *
 * Get your API key at: https://developer.postnord.com
 * Service Point v5 & Delivery Options API are the current APIs (v1 may be deprecated).
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

const POSTNORD_API_HOST =
  process.env.POSTNORD_USE_TEST_API === "true"
    ? "atapi2.postnord.com"
    : process.env.POSTNORD_API_HOST ?? "api2.postnord.com";

/**
 * Fetch nearby PostNord service points by postal code.
 * Uses PostNord Business Location API – findByPostalCode (pickuppoints/nearby returns 404).
 * For sandbox keys, set POSTNORD_USE_TEST_API=true in .env
 */
export async function getNearbyServicePoints(
  latitude: number,
  longitude: number,
  options?: {
    maxResults?: number;
    radius?: number;
    locale?: string;
    countryCode?: string;
    postalCode?: string;
    city?: string;
  }
): Promise<PostNordServicePoint[]> {
  const apiKey = process.env.POSTNORD_API_KEY?.trim();
  if (!apiKey || apiKey === "your_postnord_api_key_here") {
    throw new Error(
      "POSTNORD_API_KEY saknas i .env. Hämta nyckel på https://developer.postnord.com"
    );
  }

  const { locale = "sv", countryCode = "SE", postalCode, city } = options ?? {};
  const cc = countryCode.toUpperCase();

  // Use v5 nearest/byaddress – returns multiple service points (up to 15)
  if (postalCode && postalCode.replace(/\s/g, "").length >= 3) {
    const byAddress = await fetchByPostalCode(
      apiKey,
      postalCode.replace(/\s/g, ""),
      cc,
      locale,
      options?.city
    );
    if (byAddress.length > 0) return byAddress;
  }

  // Fallback: try pickuppoints/nearby (some keys may have access)
  return fetchByCoordinates(apiKey, latitude, longitude, options);
}

async function fetchByPostalCode(
  apiKey: string,
  postalCode: string,
  countryCode: string,
  locale: string,
  city?: string
): Promise<PostNordServicePoint[]> {
  // PostNord Service Point API v5 – nearest/byaddress
  // @see https://developer.postnord.com/apis/details/6wEaIYIBudeJHEJmhxLu
  // Requires postalCode OR city (minimum search params)
  const cleanPostal = postalCode.replace(/\s/g, "").trim();
  if (!cleanPostal && !city) return [];

  const url = new URL(
    `https://${POSTNORD_API_HOST}/rest/businesslocation/v5/servicepoints/nearest/byaddress`
  );
  url.searchParams.set("returnType", "json");
  url.searchParams.set("countryCode", countryCode);
  if (["SE", "NO", "DK", "FI"].includes(countryCode)) {
    url.searchParams.set("agreementCountry", countryCode);
  }
  url.searchParams.set("numberOfServicePoints", "15");
  url.searchParams.set("srId", "EPSG:4326");
  url.searchParams.set("context", "optionalservicepoint");
  url.searchParams.set("responseFilter", "public");
  // typeId per country: 24,25,54=SE | 37=NO | 38=FI | 6,44=DK | 61=Europe
  const typeIds: Record<string, string> = {
    SE: "24,25,54",
    NO: "37",
    DK: "6,44",
    FI: "38",
  };
  url.searchParams.set("typeId", typeIds[countryCode] ?? "24,25,37,38,44,54,61");
  url.searchParams.set("located", "all");
  url.searchParams.set("whiteLabelName", "false");
  url.searchParams.set("apikey", apiKey);
  if (cleanPostal) url.searchParams.set("postalCode", cleanPostal);
  if (city) url.searchParams.set("city", city);

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  const text = await res.text();

  if (!res.ok) {
    if (res.status === 404) return [];
    console.error("PostNord v5 byaddress:", res.status, text.slice(0, 300));
    return [];
  }

  return parseServicePointResponseV5(text);
}

async function fetchByCoordinates(
  apiKey: string,
  latitude: number,
  longitude: number,
  options?: {
    maxResults?: number;
    radius?: number;
    locale?: string;
    countryCode?: string;
  }
): Promise<PostNordServicePoint[]> {
  const { maxResults = 10, radius = 10000, locale = "sv", countryCode } = options ?? {};
  const urlsToTry = [
    `https://${POSTNORD_API_HOST}/rest/businesslocation/v1/servicepoint/findNearestByCoordinates.json`,
    `https://${POSTNORD_API_HOST}/rest/businesslocation/v1/pickuppoints/nearby.json`,
  ];

  for (const baseUrl of urlsToTry) {
    const url = new URL(baseUrl);
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("countryCode", (countryCode || "SE").toUpperCase());
    url.searchParams.set("maxNo", String(maxResults));
    url.searchParams.set("radius", String(radius));
    url.searchParams.set("locale", locale);
    if (baseUrl.includes("nearby")) {
      url.searchParams.set("origin", "coord");
    }
    url.searchParams.set("apikey", apiKey);

    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
    const text = await res.text();

    if (res.ok) {
      return parseServicePointResponse(text);
    }
    if (res.status === 404) continue;
    console.error("PostNord API:", res.status, url.pathname);
  }

  throw new Error(
    "PostNord API returnerade 404. Din API-nyckel har kanske inte åtkomst till service point API. Kontakta PostNord support."
  );
}

/** Parse PostNord v5 nearest/byaddress response */
function parseServicePointResponseV5(text: string): PostNordServicePoint[] {
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    const resp = data.servicePointInformationResponse as Record<string, unknown> | undefined;
    if (!resp?.servicePoints) return [];
    const points = resp.servicePoints as Array<Record<string, unknown>>;
    return points.map((p) => {
      const addr = (p.visitingAddress ?? p) as Record<string, unknown>;
      const coords = (p.coordinates as Array<{ northing?: number; easting?: number }>)?.[0];
      const hours = p.openingHours as { postalServices?: Array<{ openDay?: string; openTime?: string; closeTime?: string }> } | undefined;
      const hoursStr = hours?.postalServices
        ?.map((h) => `${h.openDay ?? ""} ${h.openTime ?? ""}-${h.closeTime ?? ""}`.trim())
        .filter(Boolean)
        .join(", ");
      return {
        servicePointId: String(p.servicePointId ?? p.servicepointId ?? ""),
        name: String(p.name ?? "PostNord ombud"),
        address: [addr.streetName, addr.streetNumber].filter(Boolean).join(" ").trim() || "",
        postalCode: String(addr.postalCode ?? ""),
        city: String(addr.city ?? ""),
        countryCode: String(addr.countryCode ?? "SE"),
        latitude: coords?.northing,
        longitude: coords?.easting,
        openingHours: hoursStr,
        distance: Number(p.routeDistance ?? 0) || undefined,
        routeDistance: Number(p.routeDistance ?? 0) || undefined,
      };
    });
  } catch {
    return [];
  }
}

function parseServicePointResponse(text: string): PostNordServicePoint[] {
  const v5 = parseServicePointResponseV5(text);
  if (v5.length > 0) return v5;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return [];
  }

  let points: unknown =
    data.servicepointinformation ??
    data.servicePointInformation ??
    data.servicePoints ??
    data.pickuppoint ??
    data.pickupPoint;
  if (!points && typeof data === "object") {
    const firstVal = Object.values(data)[0];
    if (firstVal && typeof firstVal === "object" && !Array.isArray(firstVal)) {
      points = (firstVal as Record<string, unknown>).servicePoints ??
        (firstVal as Record<string, unknown>).servicepointinformation;
    }
  }
  const list = Array.isArray(points) ? points : points ? [points] : [];

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
 * Shipping rates live in `@repo/shipping` — one copy, shared with
 * product-service, which is what actually charges the customer. These tiers
 * used to be duplicated here and kept aligned by a "keep in sync" comment; any
 * drift meant the price shown at checkout was not the price billed.
 *
 * Re-exported so existing imports from this module keep working.
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
} from "@repo/shipping";

const COUNTRY_NAMES: Record<string, string> = {
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
};

/** PostNord operates in Sweden, Norway, Denmark. Service point lookup only for these. */
export const POSTNORD_SERVICE_POINT_COUNTRIES = ["SE", "NO", "DK"] as const;

/**
 * Geocode postal code to coordinates using Nominatim (OpenStreetMap).
 * Supports Sweden (SE), Norway (NO), Denmark (DK) for PostNord ombud lookup.
 */
export async function geocodePostalCode(
  postalCode: string,
  countryCode: string,
  city?: string
): Promise<{ latitude: number; longitude: number } | null> {
  const cc = (countryCode || "SE").toUpperCase().trim();
  const countryName = COUNTRY_NAMES[cc] ?? "Sweden";
  const cleanPostal = postalCode.replace(/\s/g, "").trim();

  const runSearch = async (q: string) => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", cc.toLowerCase());
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "Turbomeck/1.0" },
      next: { revalidate: 86400 },
    });
    return res.ok ? res.json() : null;
  };

  // Try with city first, then postal only
  const queries = city
    ? [`${cleanPostal} ${city}, ${countryName}`, `${city} ${cleanPostal}, ${countryName}`, `${cleanPostal}, ${countryName}`]
    : [`${cleanPostal}, ${countryName}`];

  for (const query of queries) {
    const data = await runSearch(query);
    const first = Array.isArray(data) ? data[0] : null;
    if (first?.lat && first?.lon) {
      return {
        latitude: parseFloat(first.lat),
        longitude: parseFloat(first.lon),
      };
    }
  }
  return null;
}

/** @deprecated Use geocodePostalCode with country param */
export async function geocodeSwedishPostalCode(
  postalCode: string,
  city?: string
): Promise<{ latitude: number; longitude: number } | null> {
  return geocodePostalCode(postalCode, "SE", city);
}
