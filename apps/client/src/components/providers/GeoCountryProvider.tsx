"use client";

import { createContext, useContext } from "react";

/**
 * The visitor's detected country, resolved on the server.
 *
 * Seeded from `resolveDisplayCurrency()` in the root layout on every request,
 * for the same reason `CurrencyProvider` is: the first paint has to be correct.
 * A form that renders "Sverige", then fetches a country from the browser and
 * swaps the field to "Norge" a moment later, has shown the customer their
 * shipping country changing on its own — worse than guessing wrong quietly.
 *
 * This is a GUESS about where the visitor is, never an authority. What the
 * customer is charged, and the tax and Klarna treatment, all follow the
 * shipping country they actually select. It only decides what that field starts
 * on.
 *
 * `null` means no signal produced a country: the edge sent no country header
 * and the IP lookup failed, was disabled, or the address was private (which is
 * every request on localhost). Consumers fall back to their own default.
 */

const GeoCountryContext = createContext<string | null>(null);

export function GeoCountryProvider({
  country,
  children,
}: {
  country: string | null;
  children: React.ReactNode;
}) {
  return (
    <GeoCountryContext.Provider value={country}>
      {children}
    </GeoCountryContext.Provider>
  );
}

/**
 * The detected country, or null. Synchronous and stable for the life of the
 * request — there is no loading state to flicker through by design.
 */
export function useGeoCountryValue(): string | null {
  return useContext(GeoCountryContext);
}
