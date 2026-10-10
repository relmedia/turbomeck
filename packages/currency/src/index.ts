/**
 * Currency rules for the shop: what a customer is *charged* in, what prices are
 * *displayed* in, and how amounts convert between them.
 *
 * These are two different questions, and this module keeps them apart. Treating
 * them as one is what made a British visitor see Swedish kronor:
 *
 *   CHARGE currency  — narrow, deliberately. It decides which local payment
 *     methods Stripe offers (Klarna validates the charge currency against the
 *     buyer's country), what settles into the bank account, and what the books
 *     are kept in. Adding one is a business decision, not a code change.
 *
 *   DISPLAY currency — wide. Pure presentation: a number on a page, converted
 *     from the SEK catalogue price at the daily ECB rate. Showing a Brit
 *     "GBP 565" costs nothing and commits to nothing, so this list can cover
 *     every market we might plausibly ship to.
 *
 * A visitor whose display currency we cannot charge in pays in the charge
 * currency for their destination (SEK for most of the world). The cart says so
 * explicitly rather than letting the number change at checkout unexplained.
 *
 * Everything here is pure: the rate is passed in. Fetching it is `./rate`.
 */

export const BASE_CURRENCY = "SEK" as const;

/**
 * Currencies the shop can CHARGE in.
 *
 * Narrow on purpose. Each entry needs Stripe settlement, a VAT/OSS answer and
 * an accounting decision, so this grows only when the business says so — never
 * because a country was added to the display map below.
 */
export const SUPPORTED_CURRENCIES = ["SEK", "NOK", "DKK", "EUR"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Currencies prices can be DISPLAYED in. A superset of the charge currencies.
 *
 * Every entry must be quotable by the FX source in `./rate` (ECB reference
 * rates, via frankfurter); an unquotable currency would silently fall back to a
 * hardcoded rate. BGN is absent for exactly that reason — the ECB stopped
 * publishing a Bulgarian lev reference rate when Bulgaria adopted the euro,
 * which is why BG sits in the eurozone list further down.
 */
export const DISPLAY_CURRENCIES = [
  ...SUPPORTED_CURRENCIES,
  "GBP",
  "USD",
  "CHF",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "ISK",
] as const;
export type DisplayCurrencyCode = (typeof DISPLAY_CURRENCIES)[number];

type CurrencyStyle = {
  /**
   * Decimal places for retail prices — not the same thing as the currency's
   * minor unit.
   *
   * The Nordic currencies have öre and øre, but nobody prices a turbo at
   * 7 490,50 kr. The euro and pound are shown to the cent because 1 SEK is
   * about 0.09 EUR, so whole-unit rounding would turn a 5 kr item into 0 —
   * which Stripe rejects outright and which silently loses money on anything
   * cheap. The inflated ones go the other way: 244 742 Ft needs no fillér.
   */
  decimals: 0 | 2;
  symbol: string;
  /** Symbol goes before the number, as English convention requires. */
  prefix?: true;
  /**
   * Locale whose grouping and decimal marks this currency is written with.
   *
   * Tied to the currency, not to the language the page is in. A price is a
   * quantity of a currency, and "GBP 567,07" is wrong in every context — it
   * was what a British visitor saw while the number followed the Swedish
   * site language. Fixing it here means one price string renders identically
   * for every reader, and it does not wait on language detection.
   *
   * EUR gets a space-and-comma locale rather than Germany's dots: the euro
   * area has no single convention (de-DE writes 4.987,89 while fr-FR and
   * fi-FI write 4 987,89), and the spaced form is the one that cannot be
   * misread as a decimal point by someone from the other half.
   */
  numberLocale: string;
};

/**
 * How each currency is written.
 *
 * Hand-maintained rather than delegated to Intl's currency style, which would
 * force two decimals onto SEK ("7 490,00 kr") and would render DKK as a bare
 * "kr" in a Danish locale — the exact ambiguity the spelled-out codes here
 * exist to remove. Danish, Norwegian and Icelandic kroner all share "kr" with
 * the Swedish krona, and a customer must never have to guess which krona they
 * are being charged. SEK is spelled out for that same reason: it used to be
 * the one krona rendered as a bare "kr", which is precisely the ambiguity the
 * other three avoid.
 */
const CURRENCY_STYLE: Record<DisplayCurrencyCode, CurrencyStyle> = {
  SEK: { decimals: 0, symbol: "SEK", numberLocale: "sv-SE" },
  NOK: { decimals: 0, symbol: "NOK", numberLocale: "nb-NO" },
  DKK: { decimals: 0, symbol: "DKK", numberLocale: "da-DK" },
  EUR: { decimals: 2, symbol: "€", numberLocale: "fr-FR" },
  GBP: { decimals: 2, symbol: "£", prefix: true, numberLocale: "en-GB" },
  USD: { decimals: 2, symbol: "$", prefix: true, numberLocale: "en-US" },
  CHF: { decimals: 2, symbol: "CHF", numberLocale: "de-CH" },
  PLN: { decimals: 2, symbol: "zł", numberLocale: "pl-PL" },
  CZK: { decimals: 0, symbol: "Kč", numberLocale: "cs-CZ" },
  HUF: { decimals: 0, symbol: "Ft", numberLocale: "hu-HU" },
  RON: { decimals: 2, symbol: "lei", numberLocale: "ro-RO" },
  ISK: { decimals: 0, symbol: "ISK", numberLocale: "is-IS" },
};

/**
 * The euro area, which is not the same set as the EU.
 *
 * EU membership is not the test: Poland, Czechia, Hungary and Romania are
 * members and keep their own currencies, and billing a Pole in euro would offer
 * them the wrong local payment methods. Bulgaria is here because it adopted the
 * euro in 2026 — corroborated by the ECB no longer quoting BGN. If that is
 * wrong, move BG out and give it a BGN rate source; nothing else changes.
 */
const EUROZONE = [
  "AT", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
] as const;

/**
 * Destination country -> CHARGE currency.
 *
 * Driven by the shipping country the customer selects, never by IP: it is the
 * value Klarna validates against, it cannot disagree with the address on the
 * order, and it needs no third-party geolocation lookup.
 */
const COUNTRY_CHARGE_CURRENCY: Record<string, SupportedCurrency> = {
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  ...Object.fromEntries(EUROZONE.map((cc) => [cc, "EUR" as const])),
};

/**
 * Visitor country -> DISPLAY currency.
 *
 * Extends the charge map with currencies we can show but not bill in. Adding a
 * country here is safe: it changes a label, never a charge.
 */
const COUNTRY_DISPLAY_CURRENCY: Record<string, DisplayCurrencyCode> = {
  ...COUNTRY_CHARGE_CURRENCY,
  // Sterling area. The Crown Dependencies issue their own notes but price in
  // pounds, so GBP is right for all of them.
  GB: "GBP",
  GG: "GBP",
  JE: "GBP",
  IM: "GBP",
  US: "USD",
  CH: "CHF",
  LI: "CHF",
  PL: "PLN",
  CZ: "CZK",
  HU: "HUF",
  RO: "RON",
  IS: "ISK",
};

export function currencyForCountry(
  countryCode: string | null | undefined,
): SupportedCurrency {
  const cc = (countryCode ?? "").trim().toUpperCase();
  return COUNTRY_CHARGE_CURRENCY[cc] ?? BASE_CURRENCY;
}

/**
 * The currency to show prices in for a visitor detected in `countryCode`.
 *
 * Returns null for a country we have no opinion about — "keep looking", which
 * is not the same answer as "this country uses SEK". The caller decides what to
 * try next and what to fall back to.
 */
export function displayCurrencyForCountry(
  countryCode: string | null | undefined,
): DisplayCurrencyCode | null {
  const cc = (countryCode ?? "").trim().toUpperCase();
  if (!cc) return null;
  return COUNTRY_DISPLAY_CURRENCY[cc] ?? null;
}

/**
 * Language tag -> DISPLAY currency, the fallback when no country is known.
 *
 * Longest prefix wins, so `en-GB` resolves to GBP while bare `en` resolves to
 * nothing: an unqualified English browser says nothing about where its owner
 * is, and guessing a currency for every English speaker would be worse than
 * falling back to the catalogue currency. Same reason `de-CH` outranks `de` —
 * a Swiss German speaker is not in the eurozone.
 */
const LANGUAGE_DISPLAY_CURRENCY: Array<[string, DisplayCurrencyCode]> = [
  ["en-gb", "GBP"],
  ["en-us", "USD"],
  ["de-ch", "CHF"],
  ["fr-ch", "CHF"],
  ["it-ch", "CHF"],
  ["de-li", "CHF"],
  ["sv", "SEK"],
  ["nb", "NOK"],
  ["nn", "NOK"],
  ["no", "NOK"],
  ["da", "DKK"],
  ["is", "ISK"],
  ["pl", "PLN"],
  ["cs", "CZK"],
  ["hu", "HUF"],
  ["ro", "RON"],
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
  ["bg", "EUR"],
  ["ga", "EUR"],
];

/**
 * Display currency implied by an `Accept-Language` header value.
 *
 * Only the first (highest-priority) tag is considered: the rest are languages
 * the visitor also reads, not where they are. Returns null when nothing
 * matches, so the caller can keep falling through.
 */
export function displayCurrencyForLanguage(
  acceptLanguage: string | null | undefined,
): DisplayCurrencyCode | null {
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (!first) return null;
  let best: { prefix: string; currency: DisplayCurrencyCode } | null = null;
  for (const [prefix, currency] of LANGUAGE_DISPLAY_CURRENCY) {
    if (!first.startsWith(prefix)) continue;
    if (!best || prefix.length > best.prefix.length) best = { prefix, currency };
  }
  return best?.currency ?? null;
}

/** Country codes we can charge in a local currency, for UI and validation. */
export function countriesWithLocalCurrency(): string[] {
  return Object.keys(COUNTRY_CHARGE_CURRENCY);
}

/** True only for a currency the shop can actually bill in. */
export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return (
    typeof value === "string" &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value.toUpperCase())
  );
}

export function isDisplayCurrency(value: unknown): value is DisplayCurrencyCode {
  return (
    typeof value === "string" &&
    (DISPLAY_CURRENCIES as readonly string[]).includes(value.toUpperCase())
  );
}

/**
 * Normalises anything user- or DB-supplied to a currency we can CHARGE.
 *
 * Use this for an order, a PaymentIntent or a stored amount. A display-only
 * code arriving here means something has crossed the two layers, and SEK — the
 * base, needing no conversion — is the safe answer.
 */
export function normalizeCurrency(value: unknown): SupportedCurrency {
  return isSupportedCurrency(value)
    ? (value.toUpperCase() as SupportedCurrency)
    : BASE_CURRENCY;
}

/** Normalises a cookie, header or query value to a currency we can display. */
export function normalizeDisplayCurrency(value: unknown): DisplayCurrencyCode {
  return isDisplayCurrency(value)
    ? (value.toUpperCase() as DisplayCurrencyCode)
    : BASE_CURRENCY;
}

export function currencyDecimals(currency: DisplayCurrencyCode): 0 | 2 {
  return CURRENCY_STYLE[currency]?.decimals ?? 0;
}

/**
 * The parts of a formatted price, for UI that styles the symbol separately (the
 * price-filter pills) and so needs to know which side it belongs on.
 */
export function currencyParts(
  amount: number,
  currency: DisplayCurrencyCode,
): { number: string; symbol: string; prefix: boolean } {
  const style = CURRENCY_STYLE[currency] ?? CURRENCY_STYLE.SEK;
  return {
    number: new Intl.NumberFormat(style.numberLocale, {
      minimumFractionDigits: style.decimals,
      maximumFractionDigits: style.decimals,
    }).format(amount),
    symbol: style.symbol,
    prefix: style.prefix === true,
  };
}

/**
 * Convert a SEK amount to `currency` at `rate`, rounded to that currency's
 * retail precision.
 *
 * Each line price, the shipping fee and the discount are converted
 * individually, so an order has to add up from its own rounded parts: the total
 * is what Stripe charges and what the verifier re-checks, and it must equal the
 * sum of what the customer can see.
 */
export function convertFromSek(
  amountSek: number,
  currency: DisplayCurrencyCode,
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
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Minor units for Stripe.
 *
 * Only valid for a CHARGE currency: all four are two-decimal currencies as far
 * as Stripe is concerned, including the ones priced in whole units. Do not
 * reach for this with a display-only code — Stripe treats HUF and ISK as
 * zero-decimal, so multiplying by 100 would overcharge a hundredfold. Nothing
 * does today, because the charge path never sees a display currency.
 */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Symbol or code written next to a price. Prefer `formatAmount`, which also
 * puts the symbol on the correct side.
 */
export function currencySuffix(currency: DisplayCurrencyCode): string {
  return (CURRENCY_STYLE[currency] ?? CURRENCY_STYLE.SEK).symbol;
}

/**
 * `7 490 kr` / `7 148 NOK` / `667,25 €` / `£565.00` — written the way the
 * currency is written, independent of the page's language.
 */
export function formatAmount(
  amount: number,
  currency: DisplayCurrencyCode,
): string {
  const { number, symbol, prefix } = currencyParts(amount, currency);
  return prefix ? `${symbol}${number}` : `${number} ${symbol}`;
}
