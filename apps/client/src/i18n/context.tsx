"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import svTranslations from "./translations/sv.json";
import enTranslations from "./translations/en.json";

const STORAGE_KEY = "turbomeck-lang";

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

function setStoredLocale(locale: Locale) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale === "en" ? "en" : "sv";
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
  t: (key: string) => string;
  ready: boolean;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("sv");
  const [translationData, setTranslationData] = useState<Translations>(() =>
    loadTranslations("sv")
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = getStoredLocale();
    setLocaleState(stored);
    document.documentElement.lang = stored === "en" ? "en" : "sv";
    setTranslationData(loadTranslations(stored));
    setReady(true);
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    setStoredLocale(newLocale);
    setTranslationData(loadTranslations(newLocale));
  }, []);

  const t = useCallback(
    (key: string): string => {
      const value = getNested(translationData as Record<string, unknown>, key);
      if (value !== undefined) return value;
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
