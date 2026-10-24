"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Loader2, Printer } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Print options for a booked shipment's label.
 *
 * The choices are not hard-coded: PostNord returns what is valid for *this*
 * parcel from `/v3/labels/printoptions/ids`, and a combination it did not
 * offer is rejected at print time. So the dialog renders whatever came back —
 * `ste` only supports A4, for instance, and selecting it narrows the paper
 * sizes accordingly.
 *
 * Rounding follows the rest of admin (the Dialog's own `sm:rounded-lg`,
 * `rounded-md` on the option cards) rather than being overridden here.
 */

type PrintoutOption = {
  labelType: string;
  paperSize?: string[];
  rotate?: string[];
  format?: string;
};

type OptionsResponse = {
  options?: {
    summaryPrintoutLabelOptions?: PrintoutOption[];
    printoutLabelOptions?: Array<{ id: string; printoutOptions: PrintoutOption[] }>;
  };
  error?: string;
};

export type LabelPrintDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: number;
  orderNumber?: string | null;
};

/** PostNord's codes are not customer-facing wording. */
const PAPER_LABELS: Record<string, string> = {
  A4: "A4",
  A5: "A5",
  A6: "A6",
  LETTER: "Letter",
  LABEL: "Etikett",
};

const LABEL_TYPE_LABELS: Record<string, string> = {
  standard: "Standard",
  ps1: "PS1",
  ste: "STE",
};

/** Physical size of the printed waybill, for the preview column. */
const PAPER_DIMENSIONS: Record<string, string> = {
  A4: "210 mm × 297 mm",
  A5: "148 mm × 210 mm",
  A6: "105 mm × 148 mm",
  LETTER: "216 mm × 279 mm",
  LABEL: "190 mm × 105 mm",
};

/** width / height in mm, so the preview box matches the paper's real shape. */
const PAPER_RATIO: Record<string, number> = {
  A4: 210 / 297,
  A5: 148 / 210,
  A6: 105 / 148,
  LETTER: 216 / 279,
  LABEL: 190 / 105,
};

function RadioCard({
  checked,
  onSelect,
  children,
  disabled,
}: {
  checked: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2.5 rounded-md border px-4 py-3 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        disabled && "cursor-not-allowed opacity-40",
        checked
          ? "border-foreground bg-accent/40 font-medium text-foreground"
          : "border-input text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-foreground" : "border-muted-foreground/50",
        )}
        aria-hidden
      >
        {checked && <span className="size-2 rounded-full bg-foreground" />}
      </span>
      {children}
    </button>
  );
}

export function LabelPrintDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
}: LabelPrintDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<PrintoutOption[]>([]);
  const [labelType, setLabelType] = useState<string>("");
  const [paperSize, setPaperSize] = useState<string>("");
  const [rotate, setRotate] = useState<string>("0");
  const [printing, setPrinting] = useState(false);
  /** blob URL per `orderId|paperSize|rotate`. */

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch(`/api/orders/${orderId}/postnord-label-options?format=PDF&rotate=0&definePrintout=ALL`)
      .then(async (r) => {
        const data = (await r.json()) as OptionsResponse;
        if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
        const perId = data.options?.printoutLabelOptions?.[0]?.printoutOptions;
        const list = perId?.length ? perId : (data.options?.summaryPrintoutLabelOptions ?? []);
        setOptions(
          list.filter((o) => (o.format ?? "PDF").toUpperCase() === "PDF"),
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte hämta alternativ"))
      .finally(() => setLoading(false));
  }, [open, orderId]);

  /**
   * One card per waybill type, not per entry.
   *
   * PostNord splits a single `labelType` across several entries when its paper
   * sizes come from different printout definitions — `standard` arrives twice,
   * once for `["A5"]` and once for `["A4","LETTER","LABEL"]`. Rendering the raw
   * list put two identical "Standard" buttons side by side, each silently
   * offering a different half of the paper sizes. Merging by `labelType` gives
   * one choice with the union of what it supports.
   */
  const grouped = useMemo(() => {
    const byType = new Map<string, { labelType: string; paperSize: string[]; rotate: string[] }>();
    for (const o of options) {
      const entry = byType.get(o.labelType) ?? {
        labelType: o.labelType,
        paperSize: [],
        rotate: [],
      };
      for (const p of o.paperSize ?? []) if (!entry.paperSize.includes(p)) entry.paperSize.push(p);
      for (const r of o.rotate ?? []) if (!entry.rotate.includes(r)) entry.rotate.push(r);
      byType.set(o.labelType, entry);
    }
    return [...byType.values()];
  }, [options]);

  const current = useMemo(
    () => grouped.find((o) => o.labelType === labelType),
    [grouped, labelType],
  );
  const paperSizes = current?.paperSize ?? [];
  const rotations = current?.rotate ?? [];

  // Default once the grouped list exists: "standard" is the everyday waybill
  // and what PostNord's own dialog preselects.
  useEffect(() => {
    if (grouped.length === 0 || labelType) return;
    const preferred = grouped.find((o) => o.labelType === "standard") ?? grouped[0];
    if (preferred) setLabelType(preferred.labelType);
  }, [grouped, labelType]);

  // Switching waybill type can invalidate the chosen paper size — `ste` is A4
  // only — so fall back instead of sending a combination PostNord will reject.
  useEffect(() => {
    if (paperSizes.length > 0 && !paperSizes.includes(paperSize)) {
      setPaperSize(paperSizes.includes("A5") ? "A5" : (paperSizes[0] ?? ""));
    }
  }, [paperSizes, paperSize]);

  /** The chosen combination, as PostNord's query parameters. */
  const settingsQuery = useCallback(() => {
    const q = new URLSearchParams();
    if (paperSize) q.set("paperSize", paperSize);
    if (labelType) q.set("labelType", labelType);
    if (rotate) q.set("rotate", rotate);
    return q;
  }, [paperSize, labelType, rotate]);

  /**
   * PREVIEW DISABLED — fetching it creates a real, billed parcel.
   *
   * `/v3/edi/labels/pdf` is "book and print", not "print": every POST of the
   * EDI instruction registers a NEW shipment. Two identical calls returned
   * bookingIds ...8R0EIIJRBPLYRRPQEICM and ...8R1HWLUXOPCPHZHCQWRL with parcel
   * ids 00573132902027512511 and 00573132902027512528 — neither being the
   * parcel the order was actually booked as.
   *
   * So a preview that refetched on every option change was minting parcels per
   * click. Nothing here may call that endpoint again until booking stores its
   * label once and reprints are served from it.
   */

  /** 90° and 270° turn the sheet on its side, so the preview box follows. */
  const previewAspect = useMemo(() => {
    const base = PAPER_RATIO[paperSize] ?? 3 / 4;
    return rotate === "90" || rotate === "270" ? 1 / base : base;
  }, [paperSize, rotate]);

  const print = useCallback(() => {
    setPrinting(true);
    const q = settingsQuery();
    // New tab rather than fetch+blob: the route answers with a PDF and a
    // Content-Disposition, so the browser's own viewer handles it.
    window.open(`/api/orders/${orderId}/postnord-label-pdf?${q}`, "_blank", "noopener");
    setPrinting(false);
    onOpenChange(false);
  }, [orderId, settingsQuery, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="text-xl">Utskriftsalternativ</DialogTitle>
          <DialogDescription>
            Välj hur etiketten ska skrivas ut
            {orderNumber ? ` för order ${orderNumber}` : ""}. Alternativen kommer
            från PostNord och gäller just den här försändelsen.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 px-6 py-6">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : error ? (
          <div className="px-6 py-6">
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 px-6 py-6 md:grid-cols-[1fr_auto_220px]">
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-semibold">Pappersformat</h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  Välj den pappersstorlek du använder.
                </p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pappersformat">
                  {paperSizes.map((size) => (
                    <RadioCard
                      key={size}
                      checked={paperSize === size}
                      onSelect={() => setPaperSize(size)}
                    >
                      {PAPER_LABELS[size] ?? size}
                    </RadioCard>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold">Fraktsedelns storlek</h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  Storleken på fraktsedlarna på det valda pappersformatet.
                </p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Fraktsedelns storlek">
                  {grouped.map((o) => (
                    <RadioCard
                      key={o.labelType}
                      checked={labelType === o.labelType}
                      onSelect={() => setLabelType(o.labelType)}
                    >
                      {LABEL_TYPE_LABELS[o.labelType] ?? o.labelType}
                    </RadioCard>
                  ))}
                </div>
              </section>

              {rotations.length > 1 && (
                <section>
                  <h3 className="text-sm font-semibold">Rotation</h3>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Vrid etiketten om skrivaren matar papperet åt annat håll.
                  </p>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Rotation">
                    {rotations.map((r) => (
                      <RadioCard key={r} checked={rotate === r} onSelect={() => setRotate(r)}>
                        {r}°
                      </RadioCard>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="hidden w-px bg-border md:block" aria-hidden />

            <aside>
              <h3 className="text-sm font-semibold">Förhandsgranskning</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Fraktsedelns mått:
                <br />
                <span className="text-foreground">
                  {PAPER_DIMENSIONS[paperSize] ?? "—"}
                </span>
              </p>
              {/* The actual PDF, at the chosen paper's real proportions, so
                  the difference between A4 and Etikett is visible rather than
                  described. */}
              <div
                className="relative mt-3 w-full overflow-hidden rounded-md border bg-muted/30"
                style={{ aspectRatio: previewAspect }}
              >
                {/* Deliberately a drawing, not the real label: rendering the
                    real one costs a booked parcel (see the note above). */}
                <div className="absolute inset-0 flex flex-col gap-2 p-3" aria-hidden>
                  <div className="h-1.5 w-2/3 rounded-[1px] bg-muted-foreground/25" />
                  <div className="h-1.5 w-1/2 rounded-[1px] bg-muted-foreground/20" />
                  <div className="h-1.5 w-3/5 rounded-[1px] bg-muted-foreground/20" />
                  <div className="mt-auto flex h-8 items-end gap-[3px]">
                    {[6, 10, 4, 9, 5, 10, 3, 8, 6, 10, 4, 7].map((h, i) => (
                      <span
                        key={i}
                        className="flex-1 rounded-[1px] bg-muted-foreground/40"
                        style={{ height: `${h * 10}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}

        <DialogFooter className="border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Avbryt
          </Button>
          <Button
            type="button"
            onClick={print}
            disabled={loading || !!error || !paperSize || printing}
          >
            {printing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            Skriv ut
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LabelPrintDialog;
