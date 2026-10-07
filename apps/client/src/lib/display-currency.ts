import { cookies, headers } from "next/headers";
import { clientIpFromHeaders } from "@repo/auth/client-ip";
import { normalizeCurrency, type SupportedCurrency } from "@repo/currency";
import { getSekRate } from "@repo/currency/rate";

/**
 * Which currency to *display* prices in, and at what rate.
 *
 * SERVER ONLY — resolved per request and handed to the client as props, never
 * looked up in the browser. Two reasons: the rate must not be client-supplied
 * (the charge is derived from it), and a browser-side lookup would disclose
 * every visitor's IP to a third party from their own device.
 *
 * DISPLAY ONLY. What a customer is actually charged is decided at checkout from
 * the shipping country they select (`@repo/currency` `currencyForCountry`), not
 * from this. A visitor detected in Norway who ships to Sweden browses in NOK
 * and is charged in SEK — correct, because Klarna and the tax treatment follow
 * the destination, not the browser.
 *
 * Signal order, strongest first:
 *   1. `tm-currency` cookie — an explicit choice from the switcher. Always wins;
 *      a detected country must never override what the customer picked.
 *   2. A country header, if the edge provides one (`cf-ipcountry`,
 *      `x-country`, `x-vercel-ip-country`). Free, instant, no third party.
 *      Installing nginx's GeoIP2 module later activates this path with no code
 *      change.
 *   3. IP geolocation via `ipwho.is` — one call per IP, cached in memory for
 *      12h. Disabled by setting GEOIP_LOOKUP=off.
 *   4. `Accept-Language` (nb/nn/no → NOK). Catches most Norwegians even when
 *      the lookup is unavailable.
 *   5. SEK.
 *
 * Privacy note: step 3 sends the visitor's IP to ipwho.is. That belongs in the
 * privacy policy. Steps 2 and 4 send nothing, which is why they are tried
 * first and why the result is cached rather than looked up per page.
 */

export const CURRENCY_COOKIE = "tm-currency";

const COUNTRY_HEADERS = ["cf-ipcountry", "x-country", "x-vercel-ip-country"];

/** country code -> display currency. Mirrors the charge-side mapping. */
const COUNTRY_CURRENCY: Record<string, SupportedCurrency> = {
  NO: "NOK",
  SE: "SEK",
};

const LOOKUP_TTL_MS = 12 * 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 1500;
const lookupCache = new Map<string, { country: string | null; at: number }>();

export type DisplayCurrency = {
  currency: SupportedCurrency;
  /** SEK -> currency multiplier; 1 for SEK. */
  rate: number;
  /** Where the decision came from, for debugging and for the UI's wording. */
  source: "cookie" | "header" | "geoip" | "language" | "default";
};

function currencyForDetectedCountry(
  code: string | null | undefined,
): SupportedCurrency | null {
  const cc = (code ?? "").trim().toUpperCase();
  if (!cc) return null;
  return COUNTRY_CURRENCY[cc] ?? null;
}

/**
 * One IP lookup per address per 12h. Never throws and never blocks a page for
 * more than 1.5s: a missed guess costs a wrong default, a hung request costs
 * the whole render.
 */
async function geoipCountry(ip: string): Promise<string | null> {
  if (process.env.GEOIP_LOOKUP === "off") return null;
  if (!ip || ip === "unknown" || ip.startsWith("127.") || ip.startsWith("::1")) {
    return null;
  }

  const cached = lookupCache.get(ip);
  if (cached && Date.now() - cached.at < LOOKUP_TTL_MS) return cached.country;

  try {
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code`,
      { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
    );
    const data = (await res.json()) as {
      success?: boolean;
      country_code?: string;
    };
    const country = data.success && data.country_code ? data.country_code : null;
    lookupCache.set(ip, { country, at: Date.now() });
    return country;
  } catch {
    // Cache the failure briefly too, so an outage doesn't mean a lookup per
    // page view for every visitor.
    lookupCache.set(ip, { country: null, at: Date.now() });
    return null;
  }
}

function currencyFromAcceptLanguage(value: string | null): SupportedCurrency | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim().toLowerCase() ?? "";
  if (first.startsWith("nb") || first.startsWith("nn") || first.startsWith("no")) {
    return "NOK";
  }
  if (first.startsWith("sv")) return "SEK";
  return null;
}

export async function resolveDisplayCurrency(): Promise<DisplayCurrency> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);

  const chosen = cookieStore.get(CURRENCY_COOKIE)?.value;
  if (chosen) {
    const currency = normalizeCurrency(chosen);
    return { currency, rate: await getSekRate(currency), source: "cookie" };
  }

  for (const name of COUNTRY_HEADERS) {
    const fromHeader = currencyForDetectedCountry(headerList.get(name));
    if (fromHeader) {
      return {
        currency: fromHeader,
        rate: await getSekRate(fromHeader),
        source: "header",
      };
    }
  }

  const ip = clientIpFromHeaders(headerList);
  const fromGeoip = currencyForDetectedCountry(await geoipCountry(ip));
  if (fromGeoip) {
    return {
      currency: fromGeoip,
      rate: await getSekRate(fromGeoip),
      source: "geoip",
    };
  }

  const fromLanguage = currencyFromAcceptLanguage(headerList.get("accept-language"));
  if (fromLanguage) {
    return {
      currency: fromLanguage,
      rate: await getSekRate(fromLanguage),
      source: "language",
    };
  }

  return { currency: "SEK", rate: 1, source: "default" };
}
