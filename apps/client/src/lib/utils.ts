import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** URL path for a product detail page, e.g. /products/22t-td04hl-saab-935 */
export function productUrl(_id: string | number, name: string): string {
  return `/products/${toSlug(name) || "product"}`
}

/** URL-safe slug from category name, e.g. "Saab 9-3" → "saab-9-3" */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

/** Build URL slug for a category (handles subcategories for uniqueness) */
export function categorySlug(
  cat: { id: number; name: string; parentId?: number | null; parentName?: string | null }
): string {
  const name = cat.parentName
    ? `${cat.parentName}-${cat.name}`
    : cat.name
  return toSlug(name)
}

/** Resolve category param (slug or legacy id) to category id */
export function slugToCategoryId(
  param: string | null,
  categories: {
    id: number
    name: string
    parentId?: number | null
    parentName?: string | null
  }[]
): number | null {
  if (!param || param === "all" || param === "alla-produkter") return null
  const num = parseInt(param, 10)
  if (!isNaN(num)) return num
  const cat = categories.find((c) => categorySlug(c) === param)
  return cat?.id ?? null
}

/** European country codes supported for phone/country selects */
const EUROPEAN_COUNTRY_CODES = new Set([
  "SE", "NO", "DK", "FI", "DE", "NL", "BE", "FR", "ES", "IT", "AT", "CH",
  "PL", "CZ", "IE", "GB", "PT", "GR", "HU", "RO", "BG", "HR", "SK", "SI",
  "EE", "LV", "LT", "LU", "MT", "CY", "IS"
]);

/** Map language code (e.g. "sv") to country code when no region in locale */
const LANGUAGE_TO_COUNTRY: Record<string, string> = {
  sv: "SE", nb: "NO", nn: "NO", no: "NO", da: "DK", fi: "FI", de: "DE",
  nl: "NL", fr: "FR", es: "ES", it: "IT", pt: "PT", pl: "PL", cs: "CZ",
  en: "GB", el: "GR", hu: "HU", ro: "RO", bg: "BG", hr: "HR", sk: "SK",
  sl: "SI", et: "EE", lv: "LV", lt: "LT", mt: "MT", cy: "CY", is: "IS",
  be: "BE", at: "AT", ch: "CH", ie: "IE", lu: "LU",
};

/**
 * Detect default country from browser/system language.
 * Uses navigator.language and navigator.languages.
 * Returns a country code (e.g. "SE") or "SE" as fallback.
 */
export function getDefaultCountryFromBrowser(): string {
  if (typeof navigator === "undefined") return "SE";
  const langs = [navigator.language, ...(navigator.languages ?? [])];
  for (const lang of langs) {
    if (!lang) continue;
    const lower = lang.toLowerCase();
    const parts = lower.split("-");
    const region = parts[1]?.toUpperCase();
    if (region && EUROPEAN_COUNTRY_CODES.has(region)) return region;
    const langOnly = parts[0];
    if (langOnly == null) continue;
    const mapped = LANGUAGE_TO_COUNTRY[langOnly];
    if (mapped) return mapped;
  }
  return "SE";
}

/** Get category ids for filtering - includes parent + children when selecting a parent */
export function getCategoryIdsForFilter(
  param: string | null,
  categories: {
    id: number
    name: string
    parentId?: number | null
    parentName?: string | null
  }[]
): number[] {
  const id = slugToCategoryId(param, categories)
  if (id == null) return []
  const cat = categories.find((c) => c.id === id)
  if (!cat) return [id]
  const children = categories.filter((c) => c.parentId === id)
  return [id, ...children.map((c) => c.id)]
}
