"use client";

/**
 * Orders a product's images, and picks the one customers see first.
 *
 * ## Why one list instead of two fields
 *
 * The database keeps `image` and `thumbnails` separately, but the storefront
 * flattens them the moment it renders: `galleryImages = [image, ...thumbnails]`
 * (`apps/client/src/lib/api.ts:101`). So the customer never sees two fields —
 * they see one ordered gallery whose first picture is also the one on the
 * product card and in search results.
 *
 * Editing it as two fields made "which image shows first" an indirect
 * question: you had to know that the main-image slot was the answer. Here it
 * is literal — drag a picture to the front and it becomes the card image.
 * Splitting back into `image` and `thumbnails` happens on the way out.
 *
 * ## Layout
 *
 * Deliberately mirrors `ProductImageGallery` on the storefront: a square hero
 * with a row of square thumbnails under it. The point of this screen is
 * judging what the customer will see, and a grid of equal tiles in upload
 * order does not answer that.
 *
 * ## Dragging
 *
 * Native HTML5 drag events — there is no drag library in this repo and one
 * reorderable list does not justify adding one. HTML5 dragging is mouse-only
 * and invisible to a keyboard, so the arrow buttons beside each thumbnail are
 * not decoration: they are the accessible path and the only one that works on
 * a touch screen.
 */

import { useState } from "react";
import Image from "next/image";
import { Button } from "@repo/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/tooltip";
import {
  ArrowLeft,
  ArrowRight,
  Eraser,
  GripVertical,
  Loader2,
  Star,
  X,
} from "lucide-react";
import { resolveImageUrl, getFetchableImageUrl } from "@/lib/image-utils";
import { PRODUCT_API } from "@/lib/product-api";

export type GalleryValue = { image: string | null; thumbnails: string[] };

/**
 * The gallery as the customer sees it: main image first, then the rest.
 *
 * Duplicates are dropped rather than shown twice — the storefront filters the
 * main image out of the thumbnails, so a repeat here would be a picture the
 * admin can reorder but no customer will ever see.
 */
export function toGallery({ image, thumbnails }: GalleryValue): string[] {
  const all = [image ?? "", ...(thumbnails ?? [])].map((u) => (u ?? "").trim()).filter(Boolean);
  return [...new Set(all)];
}

/** Split an ordered gallery back into the two stored fields. */
export function fromGallery(images: string[]): GalleryValue {
  const clean = images.map((u) => u.trim()).filter(Boolean);
  return { image: clean[0] ?? null, thumbnails: clean.slice(1) };
}

export default function ProductGalleryOrder({
  value,
  onChange,
  disabled,
}: {
  value: GalleryValue;
  onChange: (next: GalleryValue) => void;
  disabled?: boolean;
}) {
  const images = toGallery(value);
  const [selected, setSelected] = useState(0);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = Math.min(selected, Math.max(0, images.length - 1));

  const commit = (next: string[]) => {
    onChange(fromGallery(next));
  };

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    commit(next);
    setSelected(to);
  };

  const remove = (index: number) => {
    const next = images.filter((_, i) => i !== index);
    commit(next);
    setSelected((s) => Math.max(0, Math.min(s, next.length - 1)));
  };

  /**
   * Background removal, kept available for every picture.
   *
   * It used to apply only to thumbnails, so the one image customers are most
   * likely to see — the card image — was the one that could not be cleaned up.
   */
  const removeBackground = async (url: string, index: number) => {
    setBusyUrl(url);
    setError(null);
    try {
      const res = await fetch(`${PRODUCT_API}/remove-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: getFetchableImageUrl(url) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunde inte ta bort bakgrund.");
      const next = [...images];
      next[index] = data.url;
      commit(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ta bort bakgrund.");
    } finally {
      setBusyUrl(null);
    }
  };

  if (images.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Inga bilder än. Ladda upp nedan — den första bilden blir produktens
        huvudbild.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Hero, matching the storefront's square gallery. */}
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border bg-muted">
        <Image
          src={resolveImageUrl(images[active] ?? "")}
          alt={`Bild ${active + 1}`}
          fill
          className="object-cover"
          unoptimized
        />
        {active === 0 && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white">
            <Star className="size-3 fill-current" aria-hidden />
            Visas först
          </span>
        )}
        <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
          {active + 1} / {images.length}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Dra bilderna för att ändra ordning. Den <strong>första</strong> visas på
        produktkortet, i sökresultat och som huvudbild.
      </p>

      {/* The strip. Square tiles like the storefront's, plus the controls. */}
      <div className="grid grid-cols-4 gap-2">
        {images.map((url, i) => (
          <div
            key={`${url}-${i}`}
            draggable={!disabled}
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => {
              /** Required, or the browser refuses the drop. */
              e.preventDefault();
              setDragOver(i);
            }}
            onDragLeave={() => setDragOver((d) => (d === i ? null : d))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null) move(dragFrom, i);
              setDragFrom(null);
              setDragOver(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
            className={`group relative aspect-square cursor-grab overflow-hidden rounded-md border-2 transition-colors active:cursor-grabbing ${
              i === active ? "border-foreground" : "border-transparent"
            } ${dragOver === i && dragFrom !== i ? "ring-2 ring-emerald-500" : ""} ${
              dragFrom === i ? "opacity-40" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => setSelected(i)}
              className="absolute inset-0"
              aria-label={`Visa bild ${i + 1}`}
            >
              <Image
                src={resolveImageUrl(url)}
                alt=""
                fill
                className="object-cover"
                unoptimized
              />
            </button>

            {i === 0 && (
              <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-emerald-600 p-0.5">
                <Star className="size-2.5 fill-current text-white" aria-hidden />
              </span>
            )}

            <GripVertical
              className="pointer-events-none absolute bottom-1 left-1 size-3 text-white/70 drop-shadow"
              aria-hidden
            />

            {/* Arrows: the keyboard and touch path, since HTML5 dragging is
                mouse-only. Shown on hover to keep the strip readable. */}
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-0.5 bg-black/50 py-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-5 text-white hover:bg-white/20 hover:text-white"
                disabled={disabled || i === 0}
                onClick={() => move(i, i - 1)}
                aria-label={`Flytta bild ${i + 1} framåt`}
              >
                <ArrowLeft className="size-3" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-5 text-white hover:bg-white/20 hover:text-white"
                disabled={disabled || i === images.length - 1}
                onClick={() => move(i, i + 1)}
                aria-label={`Flytta bild ${i + 1} bakåt`}
              >
                <ArrowRight className="size-3" aria-hidden />
              </Button>
            </div>

            <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              {i !== 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="size-5"
                      disabled={disabled}
                      onClick={() => move(i, 0)}
                      aria-label={`Gör bild ${i + 1} till huvudbild`}
                    >
                      <Star className="size-2.5" aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Gör till huvudbild</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="size-5"
                    disabled={disabled || busyUrl !== null}
                    onClick={() => void removeBackground(url, i)}
                    aria-label={`Ta bort bakgrund på bild ${i + 1}`}
                  >
                    {busyUrl === url ? (
                      <Loader2 className="size-2.5 animate-spin" aria-hidden />
                    ) : (
                      <Eraser className="size-2.5" aria-hidden />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ta bort bakgrund</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="size-5"
                    disabled={disabled}
                    onClick={() => remove(i)}
                    aria-label={`Ta bort bild ${i + 1}`}
                  >
                    <X className="size-2.5" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ta bort från produkten</TooltipContent>
              </Tooltip>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
