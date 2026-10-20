"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import svTranslations from "./translations/sv.json";
import enTranslations from "./translations/en.json";

import { LOCALE_COOKIE_NAME, type Locale } from "./locale";

const STORAGE_KEY = "turbomeck-lang";

/**
 * Re-exported so existing client imports keep working. Server components must
 * import from "@/i18n/locale" instead — see the note in that file.
 */
export { LOCALE_COOKIE_NAME };
export type { Locale };

type Translations = Record<string, unknown>;

const translationModules: Record<Locale, Translations> = {
  sv: svTranslations as Translations,
  en: enTranslations as Translations,
};

function loadTranslations(locale: Locale): Translations {
  return translationModules[locale] ?? translationModules.sv;
}

/**
 * `fallback` is the locale the server actually rendered with (from the
 * cookie). It is the right default when localStorage holds nothing, because
 * resetting a returning English visitor to Swedish is worse than trusting the
 * cookie they already carry.
 */
function getStoredLocale(fallback: Locale): Locale {
  if (typeof window === "undefined") return fallback;
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
  return stored === "en" || stored === "sv" ? stored : fallback;
}

function localeCookieFlags(): string {
  // SECURITY (audit L4): add `Secure` whenever the page is on https. Plain
  // HTTP dev keeps the cookie without `Secure` so the dev server still works.
  const isHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";
  return `path=/;max-age=31536000;SameSite=Lax${isHttps ? ";Secure" : ""}`;
}

function setStoredLocale(locale: Locale) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale === "en" ? "en" : "sv";
    document.cookie = `${LOCALE_COOKIE_NAME}=${locale};${localeCookieFlags()}`;
  }
}

function getNested(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  ready: boolean;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * `initialLocale` is read from the locale cookie by the root layout and must be
 * the same value the server components used.
 *
 * It used to be hardcoded "sv" here, which meant the chrome was Swedish in
 * every server-rendered page while the product data — fetched by server
 * components that DO read the cookie — came back in the visitor's language. An
 * English visitor got Swedish buttons around English products until hydration
 * swapped them. Seeding from the cookie makes both halves of the page agree on
 * the first paint, the same way CurrencyProvider is handed its currency.
 */
export function LanguageProvider({
  children,
  initialLocale = "sv",
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [translationData, setTranslationData] = useState<Translations>(() =>
    loadTranslations(initialLocale)
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = getStoredLocale(initialLocale);
    if (stored !== initialLocale) {
      // localStorage and the cookie have drifted apart — the cookie was
      // cleared or expired while the choice survived in localStorage. Rewrite
      // the cookie and refresh, or the chrome flips to English while every
      // server-rendered product stays Swedish for the rest of the session.
      setLocaleState(stored);
      setTranslationData(loadTranslations(stored));
      setStoredLocale(stored);
      router.refresh();
    } else {
      // Same value; rewrite anyway to roll the cookie's max-age forward.
      setStoredLocale(stored);
    }
    setReady(true);
  }, [initialLocale, router]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    setStoredLocale(newLocale);
    setTranslationData(loadTranslations(newLocale));
    router.refresh();
  }, [router]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      let value = getNested(translationData as Record<string, unknown>, key);
      if (value !== undefined) {
        if (vars) {
          for (const [k, v] of Object.entries(vars)) {
            value = String(value).replace(new RegExp(`{{${k}}}`, "g"), String(v));
          }
        }
        return String(value);
      }
      return key;
    },
    [translationData]
  );

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t, ready }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

export function useTranslation() {
  return useLanguage().t;
}
