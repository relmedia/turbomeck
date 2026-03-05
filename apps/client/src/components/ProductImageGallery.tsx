"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface ProductImageGalleryProps {
  images: string[];
  alt: string;
}

export function ProductImageGallery({ images, alt }: ProductImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const displayImages = images.length > 0 ? images : ["/products/1g.png"];

  return (
    <>
    <Card className="p-0 gap-0 overflow-hidden border-0 border-none bg-transparent shadow-none">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3">
          {/* Main image */}
          <div className="group/image relative aspect-square w-full overflow-hidden rounded-xl bg-neutral-200">
            <div
              className="flex h-full transition-transform duration-300 ease-out"
              style={{
                width: `${displayImages.length * 100}%`,
                transform: `translateX(-${(selectedIndex / displayImages.length) * 100}%)`,
              }}
            >
              {displayImages.map((src, i) => (
                <div
                  key={`${src}-${i}`}
                  className="relative shrink-0 aspect-square"
                  style={{ width: `${100 / displayImages.length}%` }}
                >
                  <Image
                    src={src}
                    alt={alt}
                    fill
                    className="object-contain"
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
              aria-label="Visa bild i fullskärm"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
            {displayImages.length > 1 && (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full cursor-pointer opacity-0 group-hover/image:opacity-100 transition-opacity"
                  onClick={() =>
                    setSelectedIndex((i) =>
                      i === 0 ? displayImages.length - 1 : i - 1
                    )
                  }
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full cursor-pointer opacity-0 group-hover/image:opacity-100 transition-opacity"
                  onClick={() =>
                    setSelectedIndex((i) =>
                      i === displayImages.length - 1 ? 0 : i + 1
                    )
                  }
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
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
                      onClick={() => setSelectedIndex(i)}
                      className={`relative aspect-square rounded-md overflow-hidden transition-all duration-200 ease-out min-w-0 bg-neutral-200 cursor-pointer ${
                        i === selectedIndex ? "opacity-100" : "opacity-60 hover:opacity-80"
                      }`}
                    >
                      <Image
                        src={src}
                        alt={`${alt} - bild ${i + 1}`}
                        fill
                        className="object-contain"
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
        <div className="relative flex items-center justify-center w-full h-full min-h-0">
          <span className="inline-block bg-neutral-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayImages[selectedIndex] ?? displayImages[0] ?? "/products/1g.png"}
              alt={alt}
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
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex((i) => (i === displayImages.length - 1 ? 0 : i + 1));
                }}
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  </>
  );
}
