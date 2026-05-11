"use client";

import * as React from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { useTranslation } from "@/i18n/context";

const SORT_KEYS = {
  newest: "products.sortNewest",
  oldest: "products.sortOldest",
  asc: "products.sortPriceAsc",
  desc: "products.sortPriceDesc",
} as const;

export function ProductsToolbar({
  resultCount,
  mobileFilters,
}: {
  /** When provided, shows "{count} produkter" next to the sort dropdown. */
  resultCount?: number;
  /** Slot for the mobile filter trigger (rendered on the left). */
  mobileFilters?: React.ReactNode;
} = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslation();
  const sort = searchParams.get("sort") ?? "newest";

  const handleSortChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("sort", value);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const sortOptions = [
    { value: "newest", labelKey: SORT_KEYS.newest },
    { value: "oldest", labelKey: SORT_KEYS.oldest },
    { value: "asc", labelKey: SORT_KEYS.asc },
    { value: "desc", labelKey: SORT_KEYS.desc },
  ] as const;

  return (
    <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
      <div className="flex items-center gap-2">
        {mobileFilters}
        {typeof resultCount === "number" && (
          <span className="text-sm text-muted-foreground">
            {t("products.resultCount", { count: resultCount })}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {t("products.sort")}:
        </span>
        <Select value={sort} onValueChange={handleSortChange}>
          <SelectTrigger className="w-[180px] h-9 border-border/60 bg-background">
            <SelectValue placeholder={t("products.sortPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
