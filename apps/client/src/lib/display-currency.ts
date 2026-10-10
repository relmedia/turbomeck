import { cookies, headers } from "next/headers";
import { clientIpFromHeaders } from "@repo/auth/client-ip";
import {
  displayCurrencyForCountry,
  displayCurrencyForLanguage,
  normalizeDisplayCurrency,
  type DisplayCurrencyCode,
} from "@repo/currency";
import { getSekRate } from "@repo/currency/rate";

/**
 * Which currency to *display* prices in, and at what rate.
 *
 * SERVER ONLY — resolved per request and handed to the client as props, never
 * looked up in the browser. Two reasons: the rate must not be client-supplied
 * (the charge is derived from it), and a browser-side lookup would disclose
 * every visitor's IP to a third party from their own device.
 *
 * DISPLAY ONLY, and the display list is far wider than the list of currencies
 * the shop can bill in. A visitor in London browses in GBP and is charged in
 * SEK, because sterling is not a charge currency; the cart states that before
 * they pay. What a customer is charged is decided at checkout from the shipping
 * country they select (`currencyForCountry`), never from this — Klarna and the
 * tax treatment follow the destination, not the browser.
 *
 * Signal order, strongest first:
 *   1. `tm-currency` cookie — a manual override. There is no switcher in the
 *      UI (detection only, by decision), but the branch is kept because it is
 *      how you preview another currency without a VPN: set the cookie in
 *      devtools and reload.
 *   2. A country header, if the edge provides one (`cf-ipcountry`,
 *      `x-country`, `x-vercel-ip-country`). Free, instant, no third party.
 *      Installing nginx's GeoIP2 module later activates this path with no code
 *      change.
 *   3. IP geolocation via `ipwho.is` — one call per IP, cached in memory for
 *      12h. Disabled by setting GEOIP_LOOKUP=off.
 *   4. `Accept-Language`, for tags that imply one currency (`en-GB` → GBP,
 *      `da` → DKK, `de` → EUR). Catches most visitors even when the lookup is
 *      unavailable. Region-less `en` is excluded on purpose: it says nothing
 *      about where the shopper is.
 *   5. SEK — the catalogue currency, so no conversion and no rate risk.
 *
 * Privacy note: step 3 sends the visitor's IP to ipwho.is. That belongs in the
 * privacy policy. Steps 2 and 4 send nothing, which is why they are tried
 * first and why the result is cached rather than looked up per page.
 */

export const CURRENCY_COOKIE = "tm-currency";

const COUNTRY_HEADERS = ["cf-ipcountry", "x-country", "x-vercel-ip-country"];

const LOOKUP_TTL_MS = 12 * 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 1500;
const lookupCache = new Map<string, { country: string | null; at: number }>();

export type DisplayCurrency = {
  currency: DisplayCurrencyCode;
  /** SEK -> currency multiplier; 1 for SEK. */
  rate: number;
  /** Where the decision came from, for debugging and for the UI's wording. */
  source: "cookie" | "header" | "geoip" | "language" | "default";
  /**
   * The visitor's ISO 3166-1 alpha-2 country, when a signal gave one.
   *
   * Returned alongside the currency because it comes from the same two
   * signals, so the checkout form can pre-select a shipping country on the
   * server — first paint already correct — instead of fetching it again from
   * the browser and visibly switching the field afterwards.
   *
   * Reported even when it implies no currency we can bill in: a US visitor is
   * charged in SEK but is still a US visitor. Consumers decide what is usable;
   * the shipping form, for instance, only accepts European codes.
   */
  country: string | null;
};

/**
 * One shared country table, in `@repo/currency`, so a country can never mean
 * one currency here and another at checkout. It returns null for a country we
 * have no opinion about, which is the distinction that matters: "unknown, keep
 * looking" is not the same answer as "this country uses SEK".
 */
const currencyForDetectedCountry = displayCurrencyForCountry;

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

/** Whatever country the edge already told us, if any. Free, no lookup. */
function countryFromHeaders(headerList: Headers): string | null {
  for (const name of COUNTRY_HEADERS) {
    const value = headerList.get(name)?.trim().toUpperCase();
    if (value && value.length === 2 && value !== "XX") return value;
  }
  return null;
}

export async function resolveDisplayCurrency(): Promise<DisplayCurrency> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);

  const headerCountry = countryFromHeaders(headerList);

  const chosen = cookieStore.get(CURRENCY_COOKIE)?.value;
  if (chosen) {
    const currency = normalizeDisplayCurrency(chosen);
    return {
      currency,
      rate: await getSekRate(currency),
      source: "cookie",
      // Header only: the override is a devtools preview path and is not worth
      // an IP lookup it would otherwise have skipped.
      country: headerCountry,
    };
  }

  const fromHeader = currencyForDetectedCountry(headerCountry);
  if (fromHeader) {
    return {
      currency: fromHeader,
      rate: await getSekRate(fromHeader),
      source: "header",
      country: headerCountry,
    };
  }

  // Only reached when the edge gave no country, or gave one we have no
  // currency opinion about — the lookup is cached per IP for 12h either way.
  const ip = clientIpFromHeaders(headerList);
  const geoipResult = headerCountry ?? (await geoipCountry(ip));
  const country = headerCountry ?? geoipResult;
  const fromGeoip = currencyForDetectedCountry(geoipResult);
  if (fromGeoip) {
    return {
      currency: fromGeoip,
      rate: await getSekRate(fromGeoip),
      source: "geoip",
      country,
    };
  }

  const fromLanguage = displayCurrencyForLanguage(headerList.get("accept-language"));
  if (fromLanguage) {
    return {
      currency: fromLanguage,
      rate: await getSekRate(fromLanguage),
      source: "language",
      country,
    };
  }

  return { currency: "SEK", rate: 1, source: "default", country };
}
