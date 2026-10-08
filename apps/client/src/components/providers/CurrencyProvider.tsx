"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import {
  convertFromSek,
  formatAmount,
  type DisplayCurrencyCode,
} from "@repo/currency";

/**
 * Display currency for the whole storefront.
 *
 * Seeded from the server on every request (`lib/display-currency.ts`) so the
 * first paint is already correct — no flash of SEK prices followed by a
 * client-side conversion, and no FX lookup from the visitor's browser.
 *
 * The currency is detected server-side and is not user-switchable by design.
 *
 * This is the DISPLAY currency, which may well not be a currency the shop can
 * bill in — a visitor in London browses in GBP and pays in SEK. The cart gets
 * its figures from the server quote instead, in the real charge currency, and
 * states the difference before the customer pays.
 *
 * Catalogue prices are stored in SEK, so everything here takes a SEK amount and
 * renders it in the display currency. Historical amounts (a past order, an
 * invoice) must NOT go through this: they were charged in a specific currency
 * that is recorded on the order, and re-converting them would misstate what the
 * customer paid. Use `formatAmount(amount, order.currency)` for those.
 */

type CurrencyContextValue = {
  currency: DisplayCurrencyCode;
  /** SEK -> currency multiplier. 1 when displaying SEK. */
  rate: number;
  /** How the currency was decided. Diagnostics only — nothing renders it. */
  source: "cookie" | "header" | "geoip" | "language" | "default";
  /** SEK amount -> formatted string in the display currency. */
  price: (amountSek: number) => string;
  /** SEK amount -> numeric amount in the display currency. */
  convert: (amountSek: number) => number;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({
  currency,
  rate,
  source,
  children,
}: {
  currency: DisplayCurrencyCode;
  rate: number;
  source: CurrencyContextValue["source"];
  children: React.ReactNode;
}) {
  const convert = useCallback(
    (amountSek: number) => convertFromSek(amountSek, currency, rate),
    [currency, rate],
  );

  // No language input: a price is written the way its currency is written,
  // so the same amount renders identically in the Swedish and English views.
  const price = useCallback(
    (amountSek: number) => formatAmount(convert(amountSek), currency),
    [convert, currency],
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({ currency, rate, source, price, convert }),
    [currency, rate, source, price, convert],
  );

  return (
    <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
  );
}

/**
 * Falls back to SEK at rate 1 rather than throwing, so a component rendered
 * outside the provider (a test, a storybook, an isolated island) still shows a
 * sane price instead of crashing the page.
 */
export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (ctx) return ctx;
  return {
    currency: "SEK",
    rate: 1,
    source: "default",
    price: (amountSek: number) => formatAmount(amountSek, "SEK"),
    convert: (amountSek: number) => Math.round(amountSek),
  };
}
