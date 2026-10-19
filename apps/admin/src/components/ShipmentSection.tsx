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
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Slider } from "@repo/ui/components/slider";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import {
  ChevronDown,
  Feather,
  Loader2,
  PackageCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

export type ShipmentType = "light" | "heavy";

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
    hint: "Max 15 kg",
    maxKg: 15,
    stops: [3, 5, 10, 15],
    Icon: PackageCheck,
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
 * showing both cards unselected would invite someone to pick the wrong one.
 */
export function shipmentTypeForWeight(weightKg: number | null | undefined): ShipmentType {
  if (weightKg == null || !Number.isFinite(weightKg)) return "heavy";
  return weightKg <= 3 ? "light" : "heavy";
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

/** What the AI lookup needs to identify the product it is sizing. */
export type ShipmentProductContext = {
  name: string;
  shortDescription?: string;
  description?: string;
  specifications?: { label: string; value: string }[];
};

type ShipmentSuggestion = {
  basis: string;
  notes: string;
  sources: string[];
  applied: string[];
};

export function ShipmentSection({
  value,
  onChange,
  product,
}: {
  value: ShipmentValue;
  onChange: (patch: Partial<ShipmentValue>) => void;
  /** Omit to hide the AI button (e.g. where no product text exists yet). */
  product?: ShipmentProductContext;
}) {
  const option =
    SHIPMENT_TYPE_OPTIONS.find((o) => o.value === value.shipmentType) ??
    SHIPMENT_TYPE_OPTIONS[1]!; // "heavy" is the sane default for a turbo

  const weightNum = Number(value.weight);
  const hasWeight = value.weight.trim() !== "" && Number.isFinite(weightNum);

  // Open by default when the product already carries measurements, so saved
  // data is never hidden behind a collapsed panel.
  const [dimsOpen, setDimsOpen] = useState(
    () => !!(value.lengthCm || value.widthCm || value.heightCm),
  );

  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<ShipmentSuggestion | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const canSuggest = !!product?.name?.trim();

  async function suggestShipping() {
    if (!product) return;
    setSuggesting(true);
    setSuggestError(null);
    setSuggestion(null);
    try {
      const res = await fetch("/api/suggest-shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product),
      });
      const data = (await res.json()) as {
        weightKg?: number | null;
        lengthCm?: number | null;
        widthCm?: number | null;
        heightCm?: number | null;
        basis?: string;
        notes?: string;
        sources?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Kunde inte hämta fraktuppgifter.");

      // The admin asked for these figures, so they are applied rather than
      // merely offered — but every field that changed is listed back, because
      // silently overwriting a weight that prices shipping is not acceptable.
      const patch: Partial<ShipmentValue> = {};
      const applied: string[] = [];
      if (typeof data.weightKg === "number") {
        patch.weight = String(data.weightKg);
        patch.shipmentType = shipmentTypeForWeight(data.weightKg);
        applied.push(`vikt ${formatKg(data.weightKg)} kg`);
      }
      const dimLabels = { lengthCm: "längd", widthCm: "bredd", heightCm: "höjd" } as const;
      for (const key of ["lengthCm", "widthCm", "heightCm"] as const) {
        const n = data[key];
        if (typeof n === "number") {
          patch[key] = String(n);
          applied.push(`${dimLabels[key]} ${n} cm`);
        }
      }
      if (applied.length === 0) {
        throw new Error("AI hittade inga användbara mått.");
      }
      onChange(patch);
      if (patch.lengthCm || patch.widthCm || patch.heightCm) setDimsOpen(true);
      setSuggestion({
        basis: (data.basis ?? "").trim(),
        notes: (data.notes ?? "").trim(),
        sources: Array.isArray(data.sources) ? data.sources : [],
        applied,
      });
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "Något gick fel.");
    } finally {
      setSuggesting(false);
    }
  }

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
          <div className="min-w-0 flex-1">
            <CardTitle>Försändelse</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Välj vilken typ av försändelse produkten skickas som. Vikten används
              för att räkna ut fraktpriset i kassan.
            </p>
          </div>
          {product && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={suggestShipping}
              disabled={suggesting || !canSuggest}
              title={
                canSuggest
                  ? "Låt AI ta fram fraktvikt och paketmått"
                  : "Fyll i produktnamn först"
              }
            >
              {suggesting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {suggesting ? "Söker…" : "Föreslå med AI"}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-8">
        {suggestError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {suggestError}
          </p>
        )}

        {suggestion && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium">AI fyllde i: {suggestion.applied.join(", ")}</p>
            {suggestion.basis && (
              <p className="mt-1 text-muted-foreground">Underlag: {suggestion.basis}</p>
            )}
            {suggestion.notes && (
              <p className="mt-1 text-muted-foreground">{suggestion.notes}</p>
            )}
            {suggestion.sources.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {suggestion.sources.map((url) => (
                  <li key={url} className="truncate">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Kontrollera siffrorna innan du sparar — vikten styr fraktpriset i kassan.
            </p>
          </div>
        )}

        {/* ——— What are you sending? ——— */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Vad är det du skickar?</Label>
          <div className="grid gap-3 sm:grid-cols-2">
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
