"use client";

import { Check } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { useProductFilters } from "./useProductFilters";

/**
 * Single-row toggle filter rendered as a switch-like row. Used for boolean
 * filter dimensions (stock, exchange-turbo). Kept generic so we can add
 * more later.
 */
function ToggleFilter({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "group flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors cursor-pointer",
        checked
          ? "border-primary/40 bg-primary/5"
          : "border-border hover:border-foreground/20 hover:bg-muted/50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input bg-background group-hover:border-foreground/40",
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
      <span className="flex flex-col min-w-0">
        <span
          className={cn(
            "text-sm leading-tight",
            checked ? "font-semibold text-foreground" : "font-medium text-foreground/90",
          )}
        >
          {label}
        </span>
        {hint && (
          <span className="mt-0.5 text-xs text-muted-foreground">{hint}</span>
        )}
      </span>
    </button>
  );
}

export function StockFilter() {
  const t = useTranslation();
  const { state, update } = useProductFilters();
  return (
    <ToggleFilter
      id="filter-instock"
      label={t("products.filterStockInOnly")}
      checked={state.inStockOnly}
      onCheckedChange={(next) => update({ inStockOnly: next })}
    />
  );
}

export function ExchangeTurboFilter() {
  const t = useTranslation();
  const { state, update } = useProductFilters();
  return (
    <ToggleFilter
      id="filter-utbytes"
      label={t("products.filterExchangeOnly")}
      checked={state.exchangeOnly}
      onCheckedChange={(next) => update({ exchangeOnly: next })}
    />
  );
}
