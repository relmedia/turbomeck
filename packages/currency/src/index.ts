/**
 * Which currency a customer is charged in, and how amounts are converted.
 *
 * The shop's prices are kept in SEK. A customer shipping to Norway is charged
 * in NOK, converted at a server-side rate — not because of the exchange rate
 * itself, but because Klarna (and other local methods) are only offered when
 * the charge currency matches the buyer's country. Display and charge therefore
 * have to agree, which is why this lives server-side and the result is passed
 * down to the browser rather than computed there.
 *
 * Everything here is pure: the rate is passed in. Fetching it is `./rate`.
 */

export const BASE_CURRENCY = "SEK" as const;

/** Currencies the shop can charge in. */
export const SUPPORTED_CURRENCIES = ["SEK", "NOK"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Destination country -> charge currency.
 *
 * Driven by the shipping country the customer selects, not by IP: it is the
 * value Klarna validates against, it cannot disagree with the address on the
 * order, and it needs no third-party geolocation lookup.
 */
const COUNTRY_CURRENCY: Record<string, SupportedCurrency> = {
  NO: "NOK",
  SE: "SEK",
};

export function currencyForCountry(
  countryCode: string | null | undefined,
): SupportedCurrency {
  const cc = (countryCode ?? "").trim().toUpperCase();
  return COUNTRY_CURRENCY[cc] ?? BASE_CURRENCY;
}

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return (
    typeof value === "string" &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value.toUpperCase())
  );
}

/** Normalises anything user- or DB-supplied to a currency we can charge. */
export function normalizeCurrency(value: unknown): SupportedCurrency {
  return isSupportedCurrency(value)
    ? (value.toUpperCase() as SupportedCurrency)
    : BASE_CURRENCY;
}

/**
 * Convert a SEK amount to `currency` at `rate`, rounded to a whole unit.
 *
 * Whole units on purpose: every line price, the shipping fee and the discount
 * are converted individually, so the order has to add up from its own rounded
 * parts. Rounding to the nearest 10 would look tidier on a shelf price but
 * would make `sum(lines) !== total`, and the total is what Stripe charges and
 * what the verifier compares against.
 */
export function convertFromSek(
  amountSek: number,
  currency: SupportedCurrency,
  rate: number,
): number {
  if (currency === BASE_CURRENCY) return Math.round(amountSek);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Invalid FX rate for ${currency}: ${rate}`);
  }
  return Math.round(amountSek * rate);
}

/** Minor units for Stripe (`amount` is always in the currency's smallest unit). */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/** Suffix used in prices across the storefront and in order emails. */
export function currencySuffix(currency: SupportedCurrency): string {
  return currency === "NOK" ? "NOK" : "kr";
}

/** `7 490 kr` / `7 865 NOK`, in the locale the customer is reading. */
export function formatAmount(
  amount: number,
  currency: SupportedCurrency,
  locale: "sv" | "en" = "sv",
): string {
  const formatted = new Intl.NumberFormat(locale === "en" ? "en-GB" : "sv-SE", {
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
  return `${formatted} ${currencySuffix(currency)}`;
}
