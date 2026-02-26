"use client";

import Image from "next/image";
import { useState } from "react";

interface ProductImageGalleryProps {
  images: string[];
  alt: string;
}

export function ProductImageGallery({ images, alt }: ProductImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const displayImages = images.length > 0 ? images : ["/products/1g.png"];

  return (
    <div className="flex flex-col gap-3">
      {/* Main image */}
      <div className="relative aspect-square overflow-hidden rounded-md group bg-muted/30">
        <Image
          src={displayImages[selectedIndex] ?? displayImages[0] ?? "/products/1g.png"}
          alt={alt}
          fill
          className="object-cover rounded-md transition-transform duration-300 group-hover:scale-110"
          sizes="(max-width: 1024px) 100vw, 40vw"
        />
      </div>
      {/* Thumbnails */}
      {displayImages.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {displayImages.map((src, index) => (
            <button
              key={`${src}-${index}`}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={`relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-md overflow-hidden border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-foreground ${
                selectedIndex === index
                  ? "border-foreground ring-2 ring-foreground/20"
                  : "border-transparent hover:border-muted-foreground/50"
              }`}
            >
              <Image
                src={src}
                alt={`${alt} - bild ${index + 1}`}
                fill
                className="object-cover"
                sizes="80px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
