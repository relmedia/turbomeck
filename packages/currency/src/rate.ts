// Explicit .js extension: product-service compiles with moduleResolution
// nodenext, which rejects extensionless relative imports. This is the same
// error @repo/database still throws; no reason to inherit it here.
import { BASE_CURRENCY, type SupportedCurrency } from "./index.js";

/**
 * SEK -> target-currency rate, fetched server-side and cached in memory.
 *
 * SERVER ONLY. The rate must never come from the browser: the charged amount is
 * derived from it, and `create-payment-intent` deliberately refuses any
 * client-supplied amount (audit M7). A rate fetched in the customer's browser
 * would reopen exactly that hole.
 *
 * Source: frankfurter.app, which republishes the ECB daily reference rates. No
 * API key, no account, HTTPS, and nothing about the customer is sent — unlike an
 * IP-geolocation service, this call carries no personal data, so it needs no
 * consent handling.
 *
 * Failure policy: never block a checkout on an FX lookup. A failed fetch falls
 * back to the last good value, then to `FX_RATE_SEK_<CUR>` from the
 * environment, then to a conservative built-in default. A stale rate charges
 * slightly the wrong amount; a thrown error loses the sale.
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // ECB publishes once a day
const FETCH_TIMEOUT_MS = 4000;

/**
 * Built-in last resort, kept close to the real rate rather than padded.
 *
 * A padded rate would over-charge the customer, which is worse than the shop
 * absorbing a fraction of a percent. Checked 2026-10-07 at 0.954; set
 * `FX_RATE_SEK_NOK` to pin an exact value without editing this.
 */
const FALLBACK_RATES: Record<string, number> = {
  NOK: 0.96,
};

type CacheEntry = { rate: number; fetchedAt: number };
const cache = new Map<string, CacheEntry>();

function envRate(currency: SupportedCurrency): number | null {
  const raw = process.env[`FX_RATE_SEK_${currency}`]?.trim();
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function fallbackRate(currency: SupportedCurrency): number {
  return envRate(currency) ?? FALLBACK_RATES[currency] ?? 1;
}

async function fetchRate(currency: SupportedCurrency): Promise<number | null> {
  try {
    // Canonical host: api.frankfurter.app 301s here, costing a round trip.
    const res = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=${BASE_CURRENCY}&symbols=${currency}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) {
      console.warn(`[fx] rate lookup failed: HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.[currency];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      console.warn("[fx] rate lookup returned no usable value", data);
      return null;
    }
    return rate;
  } catch (err) {
    console.warn("[fx] rate lookup threw:", (err as Error).message);
    return null;
  }
}

/**
 * The rate to use right now. Always resolves — see the failure policy above.
 *
 * @returns the multiplier to apply to a SEK amount (1 for SEK itself)
 */
export async function getSekRate(currency: SupportedCurrency): Promise<number> {
  if (currency === BASE_CURRENCY) return 1;

  const cached = cache.get(currency);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) return cached.rate;

  // An explicit env rate is treated as authoritative: it exists so an operator
  // can pin pricing without depending on an external service at all.
  const pinned = envRate(currency);
  if (pinned) {
    cache.set(currency, { rate: pinned, fetchedAt: now });
    return pinned;
  }

  const fetched = await fetchRate(currency);
  if (fetched) {
    cache.set(currency, { rate: fetched, fetchedAt: now });
    return fetched;
  }

  if (cached) {
    console.warn(
      `[fx] using stale ${BASE_CURRENCY}->${currency} rate from ${new Date(cached.fetchedAt).toISOString()}`,
    );
    return cached.rate;
  }

  const fallback = fallbackRate(currency);
  console.warn(`[fx] falling back to built-in ${BASE_CURRENCY}->${currency} = ${fallback}`);
  return fallback;
}

/** Testing/diagnostics: what is cached right now. */
export function peekRateCache(): Record<string, CacheEntry> {
  return Object.fromEntries(cache);
}
