import { clientIpFromHeaders } from "@repo/auth/client-ip";

/**
 * Where a request came from, coarsely.
 *
 * `/api/geo/country` (shipping and currency defaults) and
 * `/api/analytics/visit` (the dashboard) both go through here, and it calls
 * the same provider in the same order as `lib/display-currency.ts` -- which
 * keeps its own cookie-first path because a currency is not a location. So
 * there is still exactly one geolocation provider to name in the privacy
 * policy, and `GEOIP_LOOKUP=off` still disables all of it.
 *
 * Deliberately does not return, log or store the IP address itself. Callers
 * get a country, a region and a city and nothing that identifies a person;
 * `page_visits` keeps only what comes back from here.
 */

export type VisitorGeo = {
  /** ISO 3166-1 alpha-2, uppercase. */
  country: string | null;
  region: string | null;
  city: string | null;
};

const EMPTY: VisitorGeo = { country: null, region: null, city: null };

const LOOKUP_TIMEOUT_MS = 1500;

/**
 * How long a resolved IP is reused.
 *
 * An address does not move between countries over a browsing session, and a
 * visitor on a path like /, /produkter, /kassan would otherwise cost three
 * lookups. ipwho.is is free and rate-limited, so this is also what keeps the
 * shop inside its quota on a busy day.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Bounded so a crawler sweeping from many addresses cannot grow it forever. */
const CACHE_MAX_ENTRIES = 5_000;

const cache = new Map<string, { at: number; geo: VisitorGeo }>();

/**
 * Addresses no lookup provider can say anything about: loopback, link-local
 * and the private ranges. Every request in local development is one of these,
 * so skipping them is also what stops `pnpm dev` from calling out at all.
 */
function isUnroutable(ip: string): boolean {
  if (ip === "unknown" || ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("::ffff:")) return isUnroutable(ip.slice(7));
  if (/^(10|127)\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return true;
  // fc00::/7 and fe80::/10 -- unique-local and link-local IPv6.
  if (/^(f[cd]|fe[89ab])/i.test(ip)) return true;
  return false;
}

/** A value from a header or an API, or null if it is not worth storing. */
function clean(value: unknown, max = 80): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  // Providers use these for "we do not know"; storing them would read as data.
  if (/^(xx|unknown|n\/a|-)$/i.test(trimmed)) return null;
  return trimmed;
}

function cleanCountry(value: unknown): string | null {
  const code = clean(value, 2)?.toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
}

/**
 * What the edge already knows, free and without a round trip.
 *
 * Nothing in front of the shop populates these today -- production is plain
 * nginx -- but putting Cloudflare in front, or enabling nginx's GeoIP2
 * module, fills them in and this silently stops calling out.
 */
function fromHeaders(headers: Headers): VisitorGeo | null {
  const country =
    cleanCountry(headers.get("cf-ipcountry")) ??
    cleanCountry(headers.get("x-country")) ??
    cleanCountry(headers.get("x-vercel-ip-country"));
  if (!country) return null;
  return {
    country,
    region: clean(headers.get("x-vercel-ip-country-region")) ?? clean(headers.get("cf-region")),
    city: decodeHeaderCity(headers.get("x-vercel-ip-city") ?? headers.get("cf-ipcity")),
  };
}

/** Vercel percent-encodes city names so the header stays ASCII ("Malm%C3%B6"). */
function decodeHeaderCity(raw: string | null): string | null {
  const value = clean(raw);
  if (!value) return null;
  try {
    return clean(decodeURIComponent(value));
  } catch {
    return value;
  }
}

async function lookup(ip: string): Promise<VisitorGeo> {
  try {
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code,region,city`,
      { cache: "no-store", signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
    );
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as {
      success?: boolean;
      country_code?: string;
      region?: string;
      city?: string;
    };
    if (!data?.success) return EMPTY;
    const country = cleanCountry(data.country_code);
    if (!country) return EMPTY;
    return { country, region: clean(data.region), city: clean(data.city) };
  } catch {
    // A timeout, a rate limit or an outage. An unknown location is a fine
    // answer everywhere this is called; a thrown error would cost a visit row
    // or a product page.
    return EMPTY;
  }
}

export async function resolveVisitorGeo(headers: Headers): Promise<VisitorGeo> {
  const edge = fromHeaders(headers);
  if (edge) return edge;

  // The same kill switch `lib/display-currency.ts` honours, so one variable
  // turns off every outbound geolocation call rather than most of them.
  if (process.env.GEOIP_LOOKUP === "off") return EMPTY;

  const ip = clientIpFromHeaders(headers);
  if (!ip || isUnroutable(ip)) return EMPTY;

  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.geo;

  const geo = await lookup(ip);

  // A failed lookup is cached too, so an outage costs one call per address
  // per window instead of one per request.
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(ip, { at: Date.now(), geo });

  return geo;
}

/** Test seam: lets a harness assert cache behaviour from a known state. */
export function __clearVisitorGeoCache(): void {
  cache.clear();
}
