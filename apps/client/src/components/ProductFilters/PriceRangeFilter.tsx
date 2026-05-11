"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@repo/ui/components/slider";
import { Input } from "@repo/ui/components/input";
import { useTranslation } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { useProductFilters } from "./useProductFilters";

/**
 * Dual-thumb price slider with numeric inputs and preset range chips.
 * Commits to the URL only when the user finishes dragging (`onValueCommit`)
 * or blurs an input — dragging fires many events so we'd thrash the
 * router otherwise.
 */
export function PriceRangeFilter({
  bounds,
}: {
  /** Min/max bounds across the current product universe (kr). */
  bounds: { min: number; max: number };
}) {
  const t = useTranslation();
  const { state, update } = useProductFilters();

  const minBound = Math.floor(bounds.min);
  const maxBound = Math.ceil(bounds.max);
  const step = computeStep(minBound, maxBound);

  const urlValue = useMemo<[number, number]>(
    () => [state.minPrice ?? minBound, state.maxPrice ?? maxBound],
    [state.minPrice, state.maxPrice, minBound, maxBound],
  );

  const [draft, setDraft] = useState<[number, number]>(urlValue);
  const lastCommittedRef = useRef<[number, number]>(urlValue);

  useEffect(() => {
    setDraft(urlValue);
    lastCommittedRef.current = urlValue;
  }, [urlValue]);

  const commit = (next: [number, number]) => {
    const [min, max] = next;
    const clampedMin = Math.max(minBound, Math.min(min, max));
    const clampedMax = Math.min(maxBound, Math.max(min, max));
    if (
      clampedMin === lastCommittedRef.current[0] &&
      clampedMax === lastCommittedRef.current[1]
    ) {
      return;
    }
    lastCommittedRef.current = [clampedMin, clampedMax];
    update({
      minPrice: clampedMin > minBound ? clampedMin : null,
      maxPrice: clampedMax < maxBound ? clampedMax : null,
    });
  };

  // Snap-aware presets, computed from the actual product bounds so they
  // always fall inside the available range. Hidden when the data range
  // is too narrow to make distinct buckets meaningful (<3x).
  const presets = useMemo(
    () => computePresets(minBound, maxBound),
    [minBound, maxBound],
  );

  const isPresetActive = (preset: { from: number | null; to: number | null }) =>
    (preset.from ?? minBound) === draft[0] &&
    (preset.to ?? maxBound) === draft[1];

  const applyPreset = (preset: { from: number | null; to: number | null }) => {
    const next: [number, number] = [
      preset.from ?? minBound,
      preset.to ?? maxBound,
    ];
    setDraft(next);
    commit(next);
  };

  const fmt = (n: number) => n.toLocaleString("sv-SE");

  return (
    <div className="space-y-4">
      {/* Live value readout */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <ValuePill value={fmt(draft[0])} suffix="kr" />
        <span className="text-muted-foreground/40 select-none">—</span>
        <ValuePill value={fmt(draft[1])} suffix="kr" />
      </div>

      {/* Slider — px-2.5 keeps the 20px thumb + hover ring inside the
          256px sidebar. */}
      <div className="px-2.5 py-1">
        <Slider
          min={minBound}
          max={maxBound}
          step={step}
          value={draft}
          onValueChange={(v) => setDraft([v[0] ?? minBound, v[1] ?? maxBound])}
          onValueCommit={(v) => commit([v[0] ?? minBound, v[1] ?? maxBound])}
          aria-label={t("products.filterPrice")}
        />
      </div>

      {/* Numeric inputs */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <PriceInput
          label={t("products.filterPriceFrom")}
          min={minBound}
          max={draft[1]}
          value={draft[0]}
          onChange={(n) =>
            setDraft(([_, max]) => [Number.isFinite(n) ? n : minBound, max])
          }
          onCommit={() => commit(draft)}
        />
        <span className="pb-2.5 text-muted-foreground/50">–</span>
        <PriceInput
          label={t("products.filterPriceTo")}
          min={draft[0]}
          max={maxBound}
          value={draft[1]}
          onChange={(n) =>
            setDraft(([min]) => [min, Number.isFinite(n) ? n : maxBound])
          }
          onCommit={() => commit(draft)}
        />
      </div>

      {/* Quick presets */}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                isPresetActive(preset)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ValuePill({ value, suffix }: { value: string; suffix: string }) {
  return (
    <span className="inline-flex flex-1 items-baseline justify-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 font-medium text-foreground">
      <span className="tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {suffix}
      </span>
    </span>
  );
}

function PriceInput({
  label,
  min,
  max,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
  onCommit: () => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="relative">
        <Input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className="h-9 pr-7 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          kr
        </span>
      </div>
    </label>
  );
}

function computeStep(min: number, max: number): number {
  const range = Math.max(1, max - min);
  if (range <= 200) return 10;
  if (range <= 2_000) return 50;
  if (range <= 20_000) return 100;
  return 500;
}

type PricePreset = {
  id: string;
  label: string;
  from: number | null;
  to: number | null;
};

/**
 * Builds 4 quick-pick price ranges scaled to the actual product bounds.
 * Skips presets entirely when the range is too narrow to be useful.
 */
function computePresets(min: number, max: number): PricePreset[] {
  const range = max - min;
  if (range < 200) return [];

  // Three "natural break" thresholds at ~25/50/75% of the range, rounded
  // to clean values (nearest 100/500/1000 depending on magnitude).
  const roundTo =
    range <= 2_000 ? 100 : range <= 20_000 ? 500 : range <= 100_000 ? 1_000 : 5_000;
  const round = (n: number) => Math.round(n / roundTo) * roundTo;

  const t1 = round(min + range * 0.25);
  const t2 = round(min + range * 0.5);
  const t3 = round(min + range * 0.75);

  const fmt = (n: number) => n.toLocaleString("sv-SE");

  return [
    { id: "lt1", label: `< ${fmt(t1)} kr`, from: null, to: t1 },
    { id: "1to2", label: `${fmt(t1)}–${fmt(t2)} kr`, from: t1, to: t2 },
    { id: "2to3", label: `${fmt(t2)}–${fmt(t3)} kr`, from: t2, to: t3 },
    { id: "gt3", label: `> ${fmt(t3)} kr`, from: t3, to: null },
  ];
}
