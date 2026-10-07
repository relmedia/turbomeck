import { cookies, headers } from "next/headers";
import { clientIpFromHeaders } from "@repo/auth/client-ip";
import {
  currencyForCountry,
  normalizeCurrency,
  type SupportedCurrency,
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
 * DISPLAY ONLY. What a customer is actually charged is decided at checkout from
 * the shipping country they select (`@repo/currency` `currencyForCountry`), not
 * from this. A visitor detected in Norway who ships to Sweden browses in NOK
 * and is charged in SEK — correct, because Klarna and the tax treatment follow
 * the destination, not the browser.
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
 *   4. `Accept-Language`, for languages that map to exactly one currency
 *      (da → DKK, nb/nn → NOK, fi/de/nl/… → EUR). Catches most visitors even
 *      when the lookup is unavailable; English is excluded on purpose.
 *   5. SEK.
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
  currency: SupportedCurrency;
  /** SEK -> currency multiplier; 1 for SEK. */
  rate: number;
  /** Where the decision came from, for debugging and for the UI's wording. */
  source: "cookie" | "header" | "geoip" | "language" | "default";
};

/**
 * Reuses the charge-side mapping so display and charge can never disagree about
 * what a country's currency is — but returns null for countries we don't price
 * locally, where `currencyForCountry` would answer SEK. The difference matters:
 * "unknown, keep looking" is not the same as "this country uses SEK".
 */
function currencyForDetectedCountry(
  code: string | null | undefined,
): SupportedCurrency | null {
  const cc = (code ?? "").trim().toUpperCase();
  if (!cc) return null;
  const mapped = currencyForCountry(cc);
  if (mapped !== "SEK") return mapped;
  return cc === "SE" ? "SEK" : null;
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

/**
 * Last resort before SEK, and only for languages that map to one currency.
 *
 * English is deliberately absent: an `en-GB` browser says nothing about where
 * the shopper is or what they want to pay in, and guessing EUR for every
 * English speaker would be worse than defaulting to SEK.
 */
const LANGUAGE_CURRENCY: Array<[string, SupportedCurrency]> = [
  ["sv", "SEK"],
  ["nb", "NOK"],
  ["nn", "NOK"],
  ["no", "NOK"],
  ["da", "DKK"],
  ["fi", "EUR"],
  ["de", "EUR"],
  ["nl", "EUR"],
  ["fr", "EUR"],
  ["es", "EUR"],
  ["it", "EUR"],
  ["pt", "EUR"],
  ["el", "EUR"],
  ["et", "EUR"],
  ["lv", "EUR"],
  ["lt", "EUR"],
  ["sk", "EUR"],
  ["sl", "EUR"],
  ["hr", "EUR"],
  ["ga", "EUR"],
];

function currencyFromAcceptLanguage(value: string | null): SupportedCurrency | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim().toLowerCase() ?? "";
  for (const [prefix, currency] of LANGUAGE_CURRENCY) {
    if (first.startsWith(prefix)) return currency;
  }
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
