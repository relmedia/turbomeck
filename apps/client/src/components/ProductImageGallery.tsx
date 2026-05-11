"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "@/i18n/context";
import { ImageWithFallback } from "./ImageWithFallback";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { Card, CardContent } from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@repo/ui/components/dialog";

interface ProductImageGalleryProps {
  images: string[];
  /** Product name / label used for control aria-labels and dialog title. */
  alt: string;
  /** When true, images use alt="" because the same name appears on the page (e.g. h1). */
  decorativeImages?: boolean;
}

export function ProductImageGallery({
  images,
  alt,
  decorativeImages = false,
}: ProductImageGalleryProps) {
  const imageAlt = decorativeImages ? "" : alt;
  const t = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const displayImages = images.length > 0 ? images : ["/products/1g.png"];

  // Native scroll-snap carousel: a horizontal overflow container handles
  // both mouse-wheel and touch scrolling. We sync `selectedIndex` from the
  // scroll position so the dots/thumbnails reflect the visible image, and
  // we use programmatic `scrollTo` for prev/next/thumbnail clicks.
  const trackRef = useRef<HTMLDivElement>(null);
  const programmaticScrollUntil = useRef<number>(0);

  const scrollToIndex = useCallback((index: number, smooth = true) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(displayImages.length - 1, index));
    programmaticScrollUntil.current = performance.now() + 600;
    track.scrollTo({
      left: clamped * track.clientWidth,
      behavior: smooth ? "smooth" : "auto",
    });
    setSelectedIndex(clamped);
  }, [displayImages.length]);

  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    // While a programmatic smooth scroll is in flight, ignore intermediate
    // native scroll events — they'd otherwise drag the active index away
    // from the target before the animation finishes.
    if (performance.now() < programmaticScrollUntil.current) return;
    const width = track.clientWidth;
    if (width === 0) return;
    const index = Math.round(track.scrollLeft / width);
    setSelectedIndex((prev) => (prev === index ? prev : index));
  }, []);

  // Convert vertical mouse-wheel deltas into horizontal scroll so users can
  // browse the gallery with a normal scroll wheel. Touchpad horizontal
  // gestures (deltaX) are left alone — the browser already scrolls X then.
  // We attach manually because React's synthetic wheel listener is passive
  // by default and `preventDefault()` wouldn't take effect.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      track.scrollLeft += e.deltaY;
    };
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      track.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Keep the active slide visible if the viewport is resized (clientWidth
  // changes invalidate the previous snap position).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onResize = () => {
      programmaticScrollUntil.current = performance.now() + 200;
      track.scrollTo({ left: selectedIndex * track.clientWidth, behavior: "auto" });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [selectedIndex]);

  // Lightweight swipe handlers — only used inside the fullscreen dialog,
  // which still shows a single image at a time (not a scroll carousel).
  const dialogTouchStartX = useRef<number | null>(null);
  const dialogTouchEndX = useRef<number | null>(null);
  const handleDialogTouchStart = useCallback((e: React.TouchEvent) => {
    dialogTouchEndX.current = null;
    dialogTouchStartX.current = e.targetTouches[0]?.clientX ?? null;
  }, []);
  const handleDialogTouchMove = useCallback((e: React.TouchEvent) => {
    dialogTouchEndX.current = e.targetTouches[0]?.clientX ?? null;
  }, []);
  const handleDialogTouchEnd = useCallback(() => {
    const start = dialogTouchStartX.current;
    const end = dialogTouchEndX.current;
    if (start == null || end == null) return;
    const distance = start - end;
    if (Math.abs(distance) < 50 || displayImages.length <= 1) return;
    if (distance > 0) {
      setSelectedIndex((i) => (i === displayImages.length - 1 ? 0 : i + 1));
    } else {
      setSelectedIndex((i) => (i === 0 ? displayImages.length - 1 : i - 1));
    }
    dialogTouchStartX.current = null;
    dialogTouchEndX.current = null;
  }, [displayImages.length]);

  return (
    <>
    <Card className="p-0 gap-0 overflow-hidden border-0 border-none bg-transparent shadow-none">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3">
          {/* Main image — native horizontal scroll-snap carousel */}
          <div className="group/image relative aspect-square w-full overflow-hidden rounded-xl bg-neutral-200">
            <div
              ref={trackRef}
              onScroll={handleScroll}
              className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
              style={{ touchAction: "pan-x" }}
            >
              {displayImages.map((src, i) => (
                <div
                  key={`${src}-${i}`}
                  className="relative h-full w-full shrink-0 snap-center snap-always"
                >
                  <ImageWithFallback
                    src={src}
                    alt={imageAlt}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 40vw"
                    priority={i === 0}
                  />
                </div>
              ))}
            </div>
            <Button
              variant="secondary"
              size="icon"
              className="absolute right-2 top-2 h-8 w-8 rounded-full cursor-pointer opacity-0 group-hover/image:opacity-100 transition-opacity z-10"
              onClick={() => setFullscreenOpen(true)}
              aria-label={t("product.fullscreenImage", { name: alt })}
            >
              <Maximize2 className="w-4 h-4" aria-hidden />
            </Button>
            {displayImages.length > 1 && (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full cursor-pointer opacity-0 group-hover/image:opacity-100 transition-opacity z-10"
                  onClick={() =>
                    scrollToIndex(
                      selectedIndex === 0
                        ? displayImages.length - 1
                        : selectedIndex - 1,
                    )
                  }
                  aria-label={t("product.previousProductImage", { name: alt })}
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full cursor-pointer opacity-0 group-hover/image:opacity-100 transition-opacity z-10"
                  onClick={() =>
                    scrollToIndex(
                      selectedIndex === displayImages.length - 1
                        ? 0
                        : selectedIndex + 1,
                    )
                  }
                  aria-label={t("product.nextProductImage", { name: alt })}
                >
                  <ChevronRight className="w-4 h-4" aria-hidden />
                </Button>
                {/* Dot indicators for mobile */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 sm:hidden z-10">
                  {displayImages.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => scrollToIndex(i)}
                      className={`h-2 rounded-full transition-all ${
                        i === selectedIndex
                          ? "bg-white w-4"
                          : "bg-white/50 w-2"
                      }`}
                      aria-label={t("product.selectGalleryThumbnail", { n: i + 1, name: alt })}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
          {/* Thumbnails - show 4 at a time, slide when more */}
          {displayImages.length > 1 && (
            <div className="relative">
              <div className="overflow-hidden">
                <div
                  className="grid gap-4 transition-transform duration-300 ease-out"
                  style={{
                    gridTemplateColumns: `repeat(${displayImages.length}, minmax(0, 1fr))`,
                    width: `${(displayImages.length / 4) * 100}%`,
                    transform: `translateX(-${Math.min(selectedIndex, Math.max(0, displayImages.length - 4)) * (100 / displayImages.length)}%)`,
                  }}
                >
                  {displayImages.map((src, i) => (
                    <button
                      key={`${src}-${i}`}
                      type="button"
                      onClick={() => scrollToIndex(i)}
                      aria-label={t("product.selectGalleryThumbnail", { n: i + 1, name: alt })}
                      aria-current={i === selectedIndex ? "true" : undefined}
                      className={`relative aspect-square rounded-md overflow-hidden transition-all duration-200 ease-out min-w-0 bg-neutral-200 cursor-pointer ${
                        i === selectedIndex ? "opacity-100" : "opacity-60 hover:opacity-80"
                      }`}
                    >
                      <ImageWithFallback
                        src={src}
                        alt={
                          decorativeImages
                            ? ""
                            : `${alt} - bild ${i + 1}`
                        }
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>

    <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
      <DialogContent
        className="!max-w-[95vw] !max-h-[95vh] w-[95vw] h-[95vh] p-0 gap-0 overflow-hidden border-0 bg-black/90 [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:hover:text-white"
        showCloseButton={true}
      >
        <DialogTitle className="sr-only">
          Bildgalleri: {alt}
        </DialogTitle>
        <div
          className="relative flex items-center justify-center w-full h-full min-h-0"
          onTouchStart={handleDialogTouchStart}
          onTouchMove={handleDialogTouchMove}
          onTouchEnd={handleDialogTouchEnd}
        >
          <span className="inline-block bg-neutral-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayImages[selectedIndex] ?? displayImages[0] ?? "/products/1g.png"}
              alt={imageAlt}
              className="max-w-full max-h-[90vh] w-auto h-auto object-contain block"
              referrerPolicy="no-referrer"
              onClick={(e) => e.stopPropagation()}
            />
          </span>
          {displayImages.length > 1 && (
            <>
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex((i) => (i === 0 ? displayImages.length - 1 : i - 1));
                }}
                aria-label={t("product.previousProductImage", { name: alt })}
              >
                <ChevronLeft className="w-5 h-5" aria-hidden />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex((i) => (i === displayImages.length - 1 ? 0 : i + 1));
                }}
                aria-label={t("product.nextProductImage", { name: alt })}
              >
                <ChevronRight className="w-5 h-5" aria-hidden />
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  </>
  );
}
