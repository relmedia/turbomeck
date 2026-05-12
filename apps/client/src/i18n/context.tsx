"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import svTranslations from "./translations/sv.json";
import enTranslations from "./translations/en.json";

const STORAGE_KEY = "turbomeck-lang";
export const LOCALE_COOKIE_NAME = "turbomeck-locale";

export type Locale = "sv" | "en";

type Translations = Record<string, unknown>;

const translationModules: Record<Locale, Translations> = {
  sv: svTranslations as Translations,
  en: enTranslations as Translations,
};

function loadTranslations(locale: Locale): Translations {
  return translationModules[locale] ?? translationModules.sv;
}

function getStoredLocale(): Locale {
  if (typeof window === "undefined") return "sv";
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
  return stored === "en" || stored === "sv" ? stored : "sv";
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

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>("sv");
  const [translationData, setTranslationData] = useState<Translations>(() =>
    loadTranslations("sv")
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = getStoredLocale();
    setLocaleState(stored);
    document.documentElement.lang = stored === "en" ? "en" : "sv";
    document.cookie = `${LOCALE_COOKIE_NAME}=${stored};${localeCookieFlags()}`;
    setTranslationData(loadTranslations(stored));
    setReady(true);
  }, []);

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
