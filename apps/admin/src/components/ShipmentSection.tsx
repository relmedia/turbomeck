"use client";

/**
 * "Försändelse" — the per-product shipment section, modelled on PostNord's own
 * shipment form: what you are sending, how much it weighs, and optionally how
 * big it is.
 *
 * Used by both the product edit page and the add-product form so the two cannot
 * drift apart.
 *
 * On the weight field specifically: the number input is authoritative and
 * accepts any value, while the slider snaps to PostNord's published stops.
 * `products.weight` already drives the checkout shipping price
 * (`order-pricing.ts`), so a product sitting on 7.4 kg must stay on 7.4 kg —
 * a slider that could only express 5 or 10 would silently reprice it the first
 * time someone opened this page to edit something else.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Slider } from "@repo/ui/components/slider";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import { ChevronDown, Feather, PackageCheck, SlidersHorizontal, Truck } from "lucide-react";

export type ShipmentType = "light" | "heavy" | "pallet";

export type ShipmentValue = {
  shipmentType: ShipmentType;
  /** Free text so a half-typed "1." does not snap to 1 under the cursor. */
  weight: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
};

type ShipmentTypeOption = {
  value: ShipmentType;
  label: string;
  hint: string;
  maxKg: number;
  /** Weight slider stops, in kg. PostNord's own ladder for each class. */
  stops: number[];
  Icon: typeof Feather;
};

export const SHIPMENT_TYPE_OPTIONS: ShipmentTypeOption[] = [
  {
    value: "light",
    label: "Lätt",
    hint: "Max 3 kg",
    maxKg: 3,
    stops: [0.5, 1, 2, 3],
    Icon: Feather,
  },
  {
    value: "heavy",
    label: "Tung",
    hint: "Max 35 kg",
    maxKg: 35,
    stops: [3, 5, 10, 15, 20, 31.5, 35],
    Icon: PackageCheck,
  },
  {
    value: "pallet",
    label: "Pall",
    hint: "Max 1000 kg",
    maxKg: 1000,
    stops: [50, 100, 250, 500, 750, 1000],
    Icon: Truck,
  },
];

const DIMENSIONS: Array<{
  key: "lengthCm" | "widthCm" | "heightCm";
  label: string;
  min: number;
  max: number;
}> = [
  { key: "lengthCm", label: "Längd", min: 14, max: 175 },
  { key: "widthCm", label: "Bredd", min: 9, max: 100 },
  { key: "heightCm", label: "Höjd", min: 1, max: 100 },
];

/**
 * Pick the shipment class a legacy product belongs to from its weight alone.
 * Everything created before this section existed has `shipmentType` NULL, and
 * showing all three cards unselected would invite someone to pick the wrong one.
 */
export function shipmentTypeForWeight(weightKg: number | null | undefined): ShipmentType {
  if (weightKg == null || !Number.isFinite(weightKg)) return "heavy";
  if (weightKg <= 3) return "light";
  if (weightKg <= 35) return "heavy";
  return "pallet";
}

/** Formats kg the Swedish way, and without a trailing ",0" on whole numbers. */
function formatKg(kg: number): string {
  return kg.toLocaleString("sv-SE", { maximumFractionDigits: 1 });
}

/** Index of the stop nearest `kg`, so the slider can track a free-form value. */
function nearestStopIndex(stops: number[], kg: number): number {
  let best = 0;
  let bestDelta = Infinity;
  stops.forEach((stop, i) => {
    const delta = Math.abs(stop - kg);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  });
  return best;
}

export function ShipmentSection({
  value,
  onChange,
}: {
  value: ShipmentValue;
  onChange: (patch: Partial<ShipmentValue>) => void;
}) {
  const option =
    SHIPMENT_TYPE_OPTIONS.find((o) => o.value === value.shipmentType) ??
    SHIPMENT_TYPE_OPTIONS[1]!;

  const weightNum = Number(value.weight);
  const hasWeight = value.weight.trim() !== "" && Number.isFinite(weightNum);

  // Open by default when the product already carries measurements, so saved
  // data is never hidden behind a collapsed panel.
  const [dimsOpen, setDimsOpen] = useState(
    () => !!(value.lengthCm || value.widthCm || value.heightCm),
  );

  const sliderIndex = useMemo(
    () => (hasWeight ? nearestStopIndex(option.stops, weightNum) : 0),
    [hasWeight, option.stops, weightNum],
  );

  /** True when the typed weight sits between stops — the slider is then approximate. */
  const offStop = hasWeight && option.stops[sliderIndex] !== weightNum;
  const overMax = hasWeight && weightNum > option.maxKg;

  function selectType(next: ShipmentType) {
    const nextOption = SHIPMENT_TYPE_OPTIONS.find((o) => o.value === next);
    if (!nextOption) return;
    // Keep the weight the product actually has; only pull it down when it
    // cannot exist in the new class at all.
    const patch: Partial<ShipmentValue> = { shipmentType: next };
    if (hasWeight && weightNum > nextOption.maxKg) {
      patch.weight = String(nextOption.maxKg);
    }
    onChange(patch);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <SlidersHorizontal className="size-4" />
          </span>
          <div>
            <CardTitle>Försändelse</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Välj vilken typ av försändelse produkten skickas som. Vikten används
              för att räkna ut fraktpriset i kassan.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-8">
        {/* ——— What are you sending? ——— */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Vad är det du skickar?</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            {SHIPMENT_TYPE_OPTIONS.map((opt) => {
              const selected = opt.value === option.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => selectType(opt.value)}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-4 text-left transition-colors ${
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-input hover:bg-accent/40"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${
                        selected ? "border-primary" : "border-muted-foreground/40"
                      }`}
                    >
                      {selected && <span className="size-2 rounded-full bg-primary" />}
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{opt.label}</span>
                      <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                    </span>
                  </span>
                  <opt.Icon
                    className={`size-5 shrink-0 ${
                      selected ? "text-primary" : "text-muted-foreground/60"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* ——— Weight ——— */}
        <div className="space-y-3">
          <Label htmlFor="shipment-weight" className="text-base font-semibold">
            Försändelsens vikt
          </Label>
          <div className="flex items-start gap-5">
            <div className="relative w-28 shrink-0">
              <Input
                id="shipment-weight"
                name="weight"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                className="pr-9 text-center"
                value={value.weight}
                onChange={(e) => onChange({ weight: e.target.value })}
                placeholder="—"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                kg
              </span>
            </div>

            <div className="min-w-0 flex-1 pt-2">
              <Slider
                aria-label="Försändelsens vikt"
                min={0}
                max={option.stops.length - 1}
                step={1}
                value={[sliderIndex]}
                onValueChange={([i]) => {
                  const stop = option.stops[i ?? 0];
                  if (stop != null) onChange({ weight: String(stop) });
                }}
              />
              <div className="mt-2 flex justify-between">
                {option.stops.map((stop) => (
                  <span key={stop} className="text-xs text-muted-foreground">
                    {formatKg(stop)} kg
                  </span>
                ))}
              </div>
            </div>
          </div>

          {overMax && (
            <p className="text-xs text-destructive">
              {formatKg(weightNum)} kg överstiger {formatKg(option.maxKg)} kg för{" "}
              {option.label.toLowerCase()} försändelse — välj en annan typ.
            </p>
          )}
          {!overMax && offStop && (
            <p className="text-xs text-muted-foreground">
              Exakt vikt {formatKg(weightNum)} kg sparas. Reglaget visar närmaste steg.
            </p>
          )}
        </div>

        {/* ——— Optional dimensions ——— */}
        <Collapsible
          open={dimsOpen}
          onOpenChange={setDimsOpen}
          className="rounded-lg border p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-sm font-semibold">
                Mått <span className="font-normal text-muted-foreground">(valfritt)</span>
              </span>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Ange mått för en mer exakt prisuppskattning
              </p>
            </div>
            <CollapsibleTrigger className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">
              {dimsOpen ? "Fäll ihop" : "Visa"}
              <ChevronDown
                className={`size-4 transition-transform ${dimsOpen ? "rotate-180" : ""}`}
              />
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent className="mt-5 space-y-6">
            {DIMENSIONS.map((dim) => {
              const raw = value[dim.key];
              const num = Number(raw);
              const has = raw.trim() !== "" && Number.isFinite(num);
              return (
                <div key={dim.key} className="space-y-2">
                  <Label htmlFor={`shipment-${dim.key}`} className="text-sm">
                    {dim.label}
                  </Label>
                  <div className="flex items-start gap-5">
                    <div className="relative w-28 shrink-0">
                      <Input
                        id={`shipment-${dim.key}`}
                        type="number"
                        min={dim.min}
                        max={dim.max}
                        step="1"
                        inputMode="numeric"
                        className="pr-9 text-center"
                        value={raw}
                        onChange={(e) => onChange({ [dim.key]: e.target.value })}
                        placeholder="—"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                        cm
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 pt-2">
                      <Slider
                        aria-label={dim.label}
                        min={dim.min}
                        max={dim.max}
                        step={1}
                        value={[has ? Math.min(Math.max(num, dim.min), dim.max) : dim.min]}
                        onValueChange={([v]) => onChange({ [dim.key]: String(v ?? dim.min) })}
                      />
                      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                        <span>{dim.min} cm</span>
                        <span>{dim.max} cm</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
