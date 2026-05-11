"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/ui/components/accordion";
import { useTranslation } from "@/i18n/context";
import { categorySlug, cn } from "@/lib/utils";
import { useProductFilters } from "./useProductFilters";
import { CategoryFilter } from "./CategoryFilter";
import { PriceRangeFilter } from "./PriceRangeFilter";
import { StockFilter, ExchangeTurboFilter } from "./ToggleFilters";

type CategoryItem = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

/**
 * Left-rail filter container. Each accordion header surfaces the active
 * value of its section so users can see what's applied without expanding,
 * matching the pattern used by Stripe / Linear / Vercel filter rails.
 */
export function FilterSidebar({
  categories,
  priceBounds,
  className,
  hideHeader = false,
}: {
  categories: CategoryItem[];
  priceBounds: { min: number; max: number };
  className?: string;
  /**
   * Hide the internal "Filter" header. Used by the mobile sheet, which
   * already provides its own SheetTitle to avoid a duplicate label.
   */
  hideHeader?: boolean;
}) {
  const t = useTranslation();
  const { state, activeCount, clearAll } = useProductFilters();

  const categoryName = (() => {
    if (!state.category || state.category === "alla-produkter") return null;
    const found = categories.find((c) => categorySlug(c) === state.category);
    return found?.name ?? state.category;
  })();

  const priceSummary = (() => {
    const fmt = (n: number) => n.toLocaleString("sv-SE");
    if (state.minPrice != null && state.maxPrice != null) {
      return `${fmt(state.minPrice)}–${fmt(state.maxPrice)} kr`;
    }
    if (state.minPrice != null) return `> ${fmt(state.minPrice)} kr`;
    if (state.maxPrice != null) return `< ${fmt(state.maxPrice)} kr`;
    return null;
  })();

  const stockSummary = state.inStockOnly ? t("products.filterStockInOnly") : null;
  const exchangeSummary = state.exchangeOnly
    ? t("products.filterExchangeOnly")
    : null;

  return (
    <aside
      aria-label={t("products.filters")}
      className={cn("flex flex-col", className)}
    >
      {!hideHeader && (
        <header className="flex items-center justify-between gap-2 py-3 border-b border-border/70 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-foreground tracking-tight">
              {t("products.filters")}
            </h2>
            {activeCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-none text-primary-foreground">
                {activeCount}
              </span>
            )}
          </div>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline cursor-pointer"
            >
              {t("products.filtersClearAll")}
            </button>
          )}
        </header>
      )}

      <Accordion
        type="multiple"
        defaultValue={["category", "price", "stock", "exchange"]}
        className="w-full"
      >
        <SidebarAccordionItem
          value="category"
          title={t("products.filterCategory")}
          summary={categoryName}
        >
          <CategoryFilter categories={categories} />
        </SidebarAccordionItem>

        <SidebarAccordionItem
          value="price"
          title={t("products.filterPrice")}
          summary={priceSummary}
        >
          <PriceRangeFilter bounds={priceBounds} />
        </SidebarAccordionItem>

        <SidebarAccordionItem
          value="stock"
          title={t("products.filterStock")}
          summary={stockSummary}
        >
          <StockFilter />
        </SidebarAccordionItem>

        <SidebarAccordionItem
          value="exchange"
          title={t("products.filterExchange")}
          summary={exchangeSummary}
        >
          <ExchangeTurboFilter />
        </SidebarAccordionItem>
      </Accordion>
    </aside>
  );
}

function SidebarAccordionItem({
  value,
  title,
  summary,
  children,
}: {
  value: string;
  title: string;
  /** When non-null, rendered as the right-aligned active-state hint. */
  summary?: string | null;
  children: React.ReactNode;
}) {
  const isActive = summary != null && summary !== "";
  return (
    <AccordionItem value={value} className="border-b-0">
      <AccordionTrigger className="py-3 hover:no-underline">
        <div className="flex flex-1 items-center justify-between gap-3 min-w-0">
          <span
            className={cn(
              "text-sm tracking-tight",
              isActive ? "font-semibold text-foreground" : "font-medium",
            )}
          >
            {title}
          </span>
          {isActive && (
            <span className="truncate max-w-[140px] rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {summary}
            </span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-4">{children}</AccordionContent>
    </AccordionItem>
  );
}
