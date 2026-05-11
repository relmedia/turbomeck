"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@repo/ui/components/sheet";
import { Button } from "@repo/ui/components/button";
import { Badge } from "@repo/ui/components/badge";
import { useTranslation } from "@/i18n/context";
import { useProductFilters } from "./useProductFilters";
import { FilterSidebar } from "./FilterSidebar";

type CategoryItem = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

/**
 * Mobile filter entry point: a "Filtrera" button that opens a left-side
 * Sheet hosting the full FilterSidebar. The badge shows how many filters
 * are currently applied so users have feedback that a previous filter is
 * still active after re-opening the page.
 */
export function MobileFilterSheet({
  categories,
  priceBounds,
}: {
  categories: CategoryItem[];
  priceBounds: { min: number; max: number };
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const { activeCount, clearAll } = useProductFilters();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2"
          aria-label={t("products.filtersOpen")}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>{t("products.filtersOpen")}</span>
          {activeCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-5 px-1.5 text-[10px] leading-none"
            >
              {activeCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-full max-w-sm flex flex-col gap-0 p-0"
      >
        <SheetHeader className="border-b pr-12">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-sm">{t("products.filters")}</SheetTitle>
            {activeCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-none text-primary-foreground">
                {activeCount}
              </span>
            )}
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <FilterSidebar
            categories={categories}
            priceBounds={priceBounds}
            hideHeader
          />
        </div>
        <SheetFooter className="border-t flex-row gap-2 sm:flex-row sm:justify-stretch">
          {activeCount > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={clearAll}
              className="flex-1"
            >
              {t("products.filtersClearAll")}
            </Button>
          )}
          <SheetClose asChild>
            <Button className="flex-1">{t("products.filtersApply")}</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
