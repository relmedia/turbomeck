/**
 * Which currency a customer is charged in, and how amounts are converted.
 *
 * The shop's prices are kept in SEK. A customer is charged in their own
 * currency where we support one — not for the exchange rate's sake, but
 * because Klarna and other local payment methods are only offered when the
 * charge currency matches the buyer's country.
 *
 * Everything here is pure: the rate is passed in. Fetching it is `./rate`.
 */

export const BASE_CURRENCY = "SEK" as const;

/** Currencies the shop can charge in. */
export const SUPPORTED_CURRENCIES = ["SEK", "NOK", "DKK", "EUR"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Decimal places used for prices in each currency.
 *
 * The Nordic currencies are quoted in whole units in retail — nobody prices a
 * turbo at 7 490,50 kr. The euro is not: 1 SEK is about 0.09 EUR, so whole-euro
 * rounding would turn a 5 kr item into 0 EUR, which Stripe rejects outright and
 * which silently loses money on anything cheap.
 */
const CURRENCY_DECIMALS: Record<SupportedCurrency, 0 | 2> = {
  SEK: 0,
  NOK: 0,
  DKK: 0,
  EUR: 2,
};

/**
 * Destination country -> charge currency.
 *
 * Driven by the shipping country the customer selects, not by IP: it is the
 * value Klarna validates against, it cannot disagree with the address on the
 * order, and it needs no third-party geolocation lookup.
 *
 * Only the eurozone maps to EUR. EU membership is not the test — Poland,
 * Czechia and Hungary are in the EU and keep their own currencies, and billing
 * a Pole in euro would offer them the wrong local payment methods.
 */
const EUROZONE = [
  "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
] as const;

const COUNTRY_CURRENCY: Record<string, SupportedCurrency> = {
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  ...Object.fromEntries(EUROZONE.map((cc) => [cc, "EUR" as const])),
};

export function currencyForCountry(
  countryCode: string | null | undefined,
): SupportedCurrency {
  const cc = (countryCode ?? "").trim().toUpperCase();
  return COUNTRY_CURRENCY[cc] ?? BASE_CURRENCY;
}

/** Country codes we can charge in a local currency, for UI and validation. */
export function countriesWithLocalCurrency(): string[] {
  return Object.keys(COUNTRY_CURRENCY);
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

export function currencyDecimals(currency: SupportedCurrency): 0 | 2 {
  return CURRENCY_DECIMALS[currency] ?? 0;
}

/**
 * Convert a SEK amount to `currency` at `rate`, rounded to that currency's
 * precision.
 *
 * Each line price, the shipping fee and the discount are converted
 * individually, so an order has to add up from its own rounded parts: the total
 * is what Stripe charges and what the verifier re-checks, and it must equal the
 * sum of what the customer can see.
 */
export function convertFromSek(
  amountSek: number,
  currency: SupportedCurrency,
  rate: number,
): number {
  const decimals = currencyDecimals(currency);
  if (currency === BASE_CURRENCY) return round(amountSek, decimals);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Invalid FX rate for ${currency}: ${rate}`);
  }
  return round(amountSek * rate, decimals);
}

function round(value: number, decimals: 0 | 2): number {
  if (decimals === 0) return Math.round(value);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Minor units for Stripe. All four currencies are two-decimal currencies as far
 * as Stripe is concerned, including the ones we price in whole units.
 */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Suffix used in prices across the storefront and in order emails.
 *
 * DKK is spelled out rather than shown as "kr": Danish and Swedish kroner share
 * that symbol, and a Dane seeing "7 490 kr" cannot tell which currency they are
 * being charged.
 */
export function currencySuffix(currency: SupportedCurrency): string {
  switch (currency) {
    case "SEK":
      return "kr";
    case "EUR":
      return "€";
    default:
      return currency;
  }
}

/** `7 490 kr` / `7 148 NOK` / `667,25 €`, in the locale the customer is reading. */
export function formatAmount(
  amount: number,
  currency: SupportedCurrency,
  locale: "sv" | "en" = "sv",
): string {
  const decimals = currencyDecimals(currency);
  const formatted = new Intl.NumberFormat(locale === "en" ? "en-GB" : "sv-SE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
  return `${formatted} ${currencySuffix(currency)}`;
}
