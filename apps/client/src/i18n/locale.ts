/**
 * Locale primitives shared by server and client code.
 *
 * Deliberately NOT in `context.tsx`. That file is `"use client"`, and a server
 * component importing a plain constant out of a client module does not get the
 * string — it gets a client reference. `cookies().get(LOCALE_COOKIE_NAME)` was
 * therefore looking up the wrong key on every server render and silently
 * falling back to Swedish, so the storefront's server-rendered product names
 * never changed language no matter what the visitor picked.
 *
 * Nothing here may import from `context.tsx`, and this file must never be
 * marked `"use client"`.
 */

export type Locale = "sv" | "en";

export const LOCALE_COOKIE_NAME = "turbomeck-locale";

/** Narrow a raw cookie value to a Locale, defaulting to Swedish. */
export function localeFromCookieValue(value: string | undefined | null): Locale {
  return value === "en" ? "en" : "sv";
}
