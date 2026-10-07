"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  convertFromSek,
  formatAmount,
  type SupportedCurrency,
} from "@repo/currency";
import { useLanguage } from "@/i18n/context";

/**
 * Display currency for the whole storefront.
 *
 * Seeded from the server on every request (`lib/display-currency.ts`) so the
 * first paint is already correct — no flash of SEK prices followed by a
 * client-side conversion, and no FX lookup from the visitor's browser.
 *
 * Catalogue prices are stored in SEK, so everything here takes a SEK amount and
 * renders it in the display currency. Historical amounts (a past order, an
 * invoice) must NOT go through this: they were charged in a specific currency
 * that is recorded on the order, and re-converting them would misstate what the
 * customer paid. Use `formatAmount(amount, order.currency)` for those.
 */

type CurrencyContextValue = {
  currency: SupportedCurrency;
  /** SEK -> currency multiplier. 1 when displaying SEK. */
  rate: number;
  /** Was this detected, or chosen by the customer? Drives the switcher's hint. */
  source: "cookie" | "header" | "geoip" | "language" | "default";
  /** SEK amount -> formatted string in the display currency. */
  price: (amountSek: number) => string;
  /** SEK amount -> numeric amount in the display currency. */
  convert: (amountSek: number) => number;
  /** Persist an explicit choice; overrides detection from then on. */
  setCurrency: (currency: SupportedCurrency) => void;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const COOKIE_MAX_AGE_DAYS = 180;

export function CurrencyProvider({
  currency,
  rate,
  source,
  children,
}: {
  currency: SupportedCurrency;
  rate: number;
  source: CurrencyContextValue["source"];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { locale } = useLanguage();

  const convert = useCallback(
    (amountSek: number) => convertFromSek(amountSek, currency, rate),
    [currency, rate],
  );

  const price = useCallback(
    (amountSek: number) => formatAmount(convert(amountSek), currency, locale),
    [convert, currency, locale],
  );

  const setCurrency = useCallback(
    (next: SupportedCurrency) => {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie =
        `tm-currency=${next}; Path=/; Max-Age=${COOKIE_MAX_AGE_DAYS * 24 * 60 * 60}` +
        `; SameSite=Lax${secure}`;
      // The server resolves the currency, so a refresh is what applies it —
      // this also re-renders every price on the page from one source.
      router.refresh();
    },
    [router],
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({ currency, rate, source, price, convert, setCurrency }),
    [currency, rate, source, price, convert, setCurrency],
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
    setCurrency: () => {},
  };
}
