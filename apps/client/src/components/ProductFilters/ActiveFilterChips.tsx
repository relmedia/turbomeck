"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import { categorySlug, cn } from "@/lib/utils";
import { useProductFilters } from "./useProductFilters";

type CategoryItem = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

type Chip = {
  key: string;
  label: string;
  onRemove: () => void;
};

/**
 * Renders the currently-applied filters as removable pill chips above
 * the product grid. Hidden when no filters are active.
 */
export function ActiveFilterChips({
  categories,
  priceBounds,
  className,
}: {
  categories: CategoryItem[];
  priceBounds: { min: number; max: number };
  className?: string;
}) {
  const t = useTranslation();
  const { state, activeCount, update, clearAll } = useProductFilters();

  const categoryNameBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(categorySlug(c), c.name);
    }
    return map;
  }, [categories]);

  const chips: Chip[] = useMemo(() => {
    const list: Chip[] = [];

    if (state.category && state.category !== "alla-produkter") {
      const name = categoryNameBySlug.get(state.category) ?? state.category;
      list.push({
        key: "category",
        label: t("products.filterChipCategory", { name }),
        onRemove: () => update({ category: null }),
      });
    }

    const hasMin = state.minPrice != null;
    const hasMax = state.maxPrice != null;
    if (hasMin && hasMax) {
      list.push({
        key: "price",
        label: t("products.filterChipPrice", {
          min: state.minPrice!.toLocaleString("sv-SE"),
          max: state.maxPrice!.toLocaleString("sv-SE"),
        }),
        onRemove: () => update({ minPrice: null, maxPrice: null }),
      });
    } else if (hasMin) {
      list.push({
        key: "priceFrom",
        label: t("products.filterChipPriceFrom", {
          min: state.minPrice!.toLocaleString("sv-SE"),
        }),
        onRemove: () => update({ minPrice: null }),
      });
    } else if (hasMax) {
      list.push({
        key: "priceTo",
        label: t("products.filterChipPriceTo", {
          max: state.maxPrice!.toLocaleString("sv-SE"),
        }),
        onRemove: () => update({ maxPrice: null }),
      });
    }

    if (state.inStockOnly) {
      list.push({
        key: "inStock",
        label: t("products.filterChipInStock"),
        onRemove: () => update({ inStockOnly: false }),
      });
    }

    if (state.exchangeOnly) {
      list.push({
        key: "exchange",
        label: t("products.filterChipExchange"),
        onRemove: () => update({ exchangeOnly: false }),
      });
    }

    return list;
  }, [state, categoryNameBySlug, t, update]);

  if (activeCount === 0) return null;

  // priceBounds is intentionally unused here but kept on the API so the parent
  // can pass the same bounds it uses for the slider; future versions may
  // localize the chip if the active range matches the full bounds, etc.
  void priceBounds;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 mb-4",
        className,
      )}
    >
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          aria-label={t("products.filterRemove")}
          className={cn(
            "group inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 py-1 pl-3 pr-1.5",
            "text-xs font-medium text-foreground transition-colors cursor-pointer",
            "hover:border-primary/60 hover:bg-primary/12",
          )}
        >
          <span>{chip.label}</span>
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:bg-foreground/10 group-hover:text-foreground"
            aria-hidden
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="ml-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline cursor-pointer"
      >
        {t("products.filtersClearAll")}
      </button>
    </div>
  );
}
