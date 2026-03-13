"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

function productSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "product";
}
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchSliderProducts } from "@/lib/api";
import { useLanguage } from "@/i18n/context";
import { ProductType } from "@/types";
import { ImageWithFallback } from "./ImageWithFallback";

const AUTO_ADVANCE_MS = 5000;

export function HomepageSlider() {
  const { locale } = useLanguage();
  const [products, setProducts] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSliderProducts(locale)
      .then((data) => {
        if (!cancelled) setProducts(data);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
  }, [locale]);

  const goTo = useCallback(
    (i: number) => {
      if (products.length === 0) return;
      setIndex(((i % products.length) + products.length) % products.length);
    },
    [products.length]
  );

  useEffect(() => {
    if (products.length <= 1) return;
    const id = setInterval(() => goTo(index + 1), AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [products.length, index, goTo]);

  if (loading) {
    return (
      <div className="relative mb-12 flex min-h-[280px] w-full overflow-hidden rounded-xl border border-zinc-600/60 bg-zinc-950">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:24px_24px]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500/50 border-t-amber-400" />
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="relative mb-12 flex min-h-[280px] w-full overflow-hidden rounded-xl border border-zinc-600/60 bg-zinc-950">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:24px_24px]" />
        <div className="relative flex flex-1 items-center justify-center p-8">
          <Image
            src="/featured.png"
            alt="Featured"
            width={400}
            height={200}
            className="object-contain opacity-80"
          />
        </div>
      </div>
    );
  }

  const product = products[index];
  const imgSrc = product.galleryImages?.[0] || product.images?.default || "/logo.svg";
  const slug = product.slug || productSlug(product.name) || String(product.id);
  const href = `/products/${slug}`;
  const priceStr = typeof product.price === "number" ? `${product.price} kr` : String(product.price);
  const shortDesc = product.shortDescription?.trim() || product.description?.slice(0, 120);

  return (
    <div className="group relative mb-12 w-full overflow-hidden rounded-xl shadow-2xl">
      <Link href={href} className="flex min-h-[280px] md:min-h-[340px]">
        {/* Dark background with subtle warm bokeh */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, #1c1917 0%, #292524 40%, #1f1e1b 70%, #0c0a09 100%)",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_90%_50%,_rgba(251,191,36,0.08)_0%,_transparent_50%)]" />

        <div className="relative flex w-full flex-col md:flex-row">
          {/* Text – left */}
          <div className="flex flex-1 flex-col justify-center px-6 py-8 md:px-10 md:py-10">
            <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl lg:text-3xl">
              {product.name}
            </h2>
            {shortDesc && (
              <p className="mt-2 line-clamp-2 text-sm text-gray-300 md:text-base">
                {shortDesc}
              </p>
            )}
            <p className="mt-4 text-sm text-gray-400">Från</p>
            <p className="text-2xl font-bold text-amber-400 md:text-3xl">{priceStr}</p>
            <span className="mt-5 inline-flex w-fit items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition-colors group-hover:bg-orange-600">
              Handla nu <ArrowRight className="h-4 w-4" />
            </span>
          </div>

          {/* Product image – right */}
          <div className="relative flex flex-1 items-center justify-center p-6 md:p-10">
            <div className="relative h-40 w-full max-w-sm md:h-64 md:max-w-lg">
              {/* Soft backdrop for product presentation */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/5 to-transparent ring-1 ring-white/10" />
              <div className="absolute -inset-4 rounded-2xl bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,rgba(251,191,36,0.06)_0%,transparent_70%)] blur-xl" />
              <ImageWithFallback
                src={imgSrc}
                alt={product.name}
                fill
                className="relative z-10 object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                style={{
                  filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.4)) drop-shadow(0 20px 40px rgba(0,0,0,0.3))",
                }}
                sizes="(max-width: 768px) 384px, 512px"
              />
            </div>
          </div>
        </div>
      </Link>

      {products.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              goTo(index - 1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-white/10 p-2 text-white backdrop-blur-sm transition-opacity hover:bg-white/20 md:opacity-0 md:group-hover:opacity-100"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              goTo(index + 1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-zinc-600/50 bg-zinc-800/80 p-2 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-700/80 hover:text-white"
            aria-label="Next slide"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
            {products.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  goTo(i);
                }}
                className={`h-2 w-2 rounded-full transition-all ${
                  i === index ? "w-6 bg-amber-500" : "bg-zinc-600 hover:bg-zinc-500"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
