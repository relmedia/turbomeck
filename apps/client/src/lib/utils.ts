import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Canonical URL path for a product detail page.
 *
 * `product.slug` comes from the API, which derives it from the raw Swedish
 * `name` column and NOT from the localized name
 * (product-service/src/index.ts:960) — so it is the one spelling of this
 * product's URL that is identical in every locale. Preferring it is what
 * stops the sv and en views of one product from being two indexable URLs.
 *
 * `toSlug(name)` stays only as a fallback for callers holding a product that
 * predates the API field (cart lines, compare entries), and the numeric id as
 * a last resort. Both still resolve server-side, and the product page 308s
 * them to this canonical form.
 */
export function productUrl(product: { id: string | number; name?: string; slug?: string }): string {
  const slug = product.slug || (product.name ? toSlug(product.name) : null);
  return `/products/${slug || product.id}`;
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

/**
 * Slugs that have ever named the catch-all container row.
 *
 * Kept only as a fallback for environments whose row still carries one of
 * these names. Identity must NOT depend on this: the name is editable in
 * admin, and renaming the row ("Alla Produkter" -> "Shoppen") used to change
 * its slug, drop it out of this set and make the container surface as a real
 * category card linking to an empty listing.
 */
const LEGACY_CONTAINER_SLUGS = new Set(["alla-produkter", "all-products"]);

/** `categories.description` value the catch-all row ships with. */
const CONTAINER_DESCRIPTION = "root category";

/**
 * Is this category a container rather than somewhere to browse to?
 *
 * Name-independent by design. A container is a top-level row that groups
 * nothing: no parent and no children. Every real top-level category in this
 * shop is a make or a parts tree and therefore has subcategories, while the
 * catch-all row has none — and the browse cards exist precisely to show those
 * subcategories as chips, so a childless top-level row has nothing to put on
 * one either way.
 */
export function isContainerCategory(
  cat: {
    id: number;
    name: string;
    description?: string | null;
    parentId?: number | null;
    parentName?: string | null;
  },
  categories: { id: number; parentId?: number | null }[],
): boolean {
  if (cat.parentId) return false;
  // Marker the row has carried since it was created (description = "Root
  // category"), so the container stays identifiable even if it is later given
  // children.
  if (cat.description?.trim().toLowerCase() === CONTAINER_DESCRIPTION) return true;
  if (LEGACY_CONTAINER_SLUGS.has(categorySlug(cat))) return true;
  return !categories.some((c) => c.parentId === cat.id);
}

/**
 * Should this category be offered as a top-level destination — a browse card,
 * a header menu entry, a filter chip?
 *
 * Use THIS at call sites, not `isContainerCategory`. The predicate callers
 * actually want is "top-level AND not the container", and negating the
 * container test alone silently lets every subcategory through: a child is not
 * a container, so `!isContainerCategory(child)` is true. That regression put
 * all 21 categories into the header menu and the card grid at once.
 */
export function isBrowsableTopLevelCategory(
  cat: {
    id: number;
    name: string;
    description?: string | null;
    parentId?: number | null;
    parentName?: string | null;
  },
  categories: { id: number; parentId?: number | null }[],
): boolean {
  if (cat.parentId) return false;
  return !isContainerCategory(cat, categories);
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

/**
 * Strip leading "#" from stored order numbers so copy like "TM-order #{{n}}" never renders "##265".
 */
export function normalizeShopOrderNumber(orderNumber: string | number): string {
  const s = String(orderNumber).trim();
  const stripped = s.replace(/^#+/u, "").trim();
  return stripped || s;
}
