"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * URL contract for the product filter UI.
 *
 * Filter keys live alongside the existing routing keys (category/sort/page/search).
 * Empty/falsy values are removed from the URL so it stays short and shareable.
 *
 * - category   : string  (existing) — category slug
 * - minPrice   : number  — inclusive lower bound (kr)
 * - maxPrice   : number  — inclusive upper bound (kr)
 * - inStock    : "1"     — presence means "only show items with stock > 0"
 * - utbytes    : "1"     — presence means "only show exchange turbos"
 */
export type ProductFiltersState = {
  category: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  inStockOnly: boolean;
  exchangeOnly: boolean;
};

export const FILTER_KEYS = {
  category: "category",
  minPrice: "minPrice",
  maxPrice: "maxPrice",
  inStock: "inStock",
  utbytes: "utbytes",
} as const;

function parseNumberParam(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function readFiltersFromParams(
  searchParams: URLSearchParams,
): ProductFiltersState {
  return {
    category: searchParams.get(FILTER_KEYS.category),
    minPrice: parseNumberParam(searchParams.get(FILTER_KEYS.minPrice)),
    maxPrice: parseNumberParam(searchParams.get(FILTER_KEYS.maxPrice)),
    inStockOnly: searchParams.get(FILTER_KEYS.inStock) === "1",
    exchangeOnly: searchParams.get(FILTER_KEYS.utbytes) === "1",
  };
}

/** Count how many filter dimensions are active (excludes search/sort/page). */
export function countActiveFilters(state: ProductFiltersState): number {
  let n = 0;
  if (state.category && state.category !== "alla-produkter") n++;
  if (state.minPrice != null) n++;
  if (state.maxPrice != null) n++;
  if (state.inStockOnly) n++;
  if (state.exchangeOnly) n++;
  return n;
}

type FilterPatch = Partial<{
  category: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  inStockOnly: boolean;
  exchangeOnly: boolean;
}>;

/**
 * Read + write product filters from/to the URL. All updates also reset
 * `page=1` so filter changes never strand the user on a now-empty page.
 */
export function useProductFilters() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const state = useMemo(
    () => readFiltersFromParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const activeCount = useMemo(() => countActiveFilters(state), [state]);

  const update = useCallback(
    (patch: FilterPatch) => {
      const params = new URLSearchParams(searchParams.toString());

      if ("category" in patch) {
        if (patch.category && patch.category !== "alla-produkter") {
          params.set(FILTER_KEYS.category, patch.category);
        } else {
          params.delete(FILTER_KEYS.category);
        }
      }
      if ("minPrice" in patch) {
        if (patch.minPrice != null && Number.isFinite(patch.minPrice)) {
          params.set(FILTER_KEYS.minPrice, String(patch.minPrice));
        } else {
          params.delete(FILTER_KEYS.minPrice);
        }
      }
      if ("maxPrice" in patch) {
        if (patch.maxPrice != null && Number.isFinite(patch.maxPrice)) {
          params.set(FILTER_KEYS.maxPrice, String(patch.maxPrice));
        } else {
          params.delete(FILTER_KEYS.maxPrice);
        }
      }
      if ("inStockOnly" in patch) {
        if (patch.inStockOnly) params.set(FILTER_KEYS.inStock, "1");
        else params.delete(FILTER_KEYS.inStock);
      }
      if ("exchangeOnly" in patch) {
        if (patch.exchangeOnly) params.set(FILTER_KEYS.utbytes, "1");
        else params.delete(FILTER_KEYS.utbytes);
      }

      params.delete("page");

      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const clearAll = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of Object.values(FILTER_KEYS)) {
      params.delete(key);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return { state, activeCount, update, clearAll };
}
