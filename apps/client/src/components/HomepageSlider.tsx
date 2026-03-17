"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchSliderProducts } from "@/lib/api";
import { useLanguage } from "@/i18n/context";
import { ProductType } from "@/types";
import { ImageWithFallback } from "./ImageWithFallback";

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

const AUTO_ADVANCE_MS = 6000;

export function HomepageSlider() {
  const { locale } = useLanguage();
  const [products, setProducts] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const prevIndexRef = useRef(0);
  const isFirstRenderRef = useRef(true);
  const smokeRef = useRef<HTMLDivElement>(null);

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
      const next = ((i % products.length) + products.length) % products.length;
      if (next === index) return;
      setIndex(next);
    },
    [products.length, index]
  );

  useEffect(() => {
    if (products.length <= 1) return;
    const id = setInterval(() => goTo(index + 1), AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [products.length, index, goTo]);

  // GSAP moving smoke background
  useEffect(() => {
    if (!smokeRef.current || products.length === 0) return;
    const smokeEls = smokeRef.current.querySelectorAll("[data-smoke]");
    if (smokeEls.length === 0) return;

    const tweens: gsap.core.Tween[] = [];
    smokeEls.forEach((smoke, i) => {
      const xMove = 80 + (i % 4) * 40;
      const yMove = 40 + (i % 3) * 30;
      const duration = 12 + i * 3;
      const t = gsap.fromTo(
        smoke,
        { x: 0, y: 0, scale: 1, opacity: 0.5 },
        {
          x: i % 2 === 0 ? xMove : -xMove,
          y: i % 2 === 1 ? yMove : -yMove,
          scale: 1.3 + (i % 3) * 0.15,
          opacity: 0.8,
          duration,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          force3D: true,
        }
      );
      tweens.push(t);
    });

    return () => tweens.forEach((t) => t.kill());
  }, [products.length]);

  // GSAP slide transition
  useEffect(() => {
    if (!trackRef.current || products.length === 0) return;

    const slideWidth = 100 / products.length;
    const xPercent = -index * slideWidth;
    const prevIndex = prevIndexRef.current;
    const isTransition = prevIndex !== index;

    // Animate OUT the leaving slide's text and content
    if (isTransition && !isFirstRenderRef.current) {
      const prevSlideEl = slideRefs.current[prevIndex];
      if (prevSlideEl) {
        const prevTextEls = prevSlideEl.querySelectorAll("[data-slide-text]");
        const prevImgEl = prevSlideEl.querySelector("[data-slide-image]");
        const prevCtaEl = prevSlideEl.querySelector("[data-slide-cta]");

        gsap.to(prevTextEls, {
          opacity: 0,
          y: -30,
          x: -15,
          scale: 0.98,
          duration: 0.35,
          stagger: 0.05,
          ease: "power2.in",
          overwrite: "auto",
        });
        gsap.to(prevImgEl, { opacity: 0, scale: 0.95, duration: 0.3, ease: "power2.in", overwrite: "auto" });
        gsap.to(prevCtaEl, { opacity: 0, x: -12, duration: 0.2, ease: "power2.in", overwrite: "auto" });
      }
    }

    // Slide track movement
    gsap.to(trackRef.current, {
      xPercent,
      duration: 0.7,
      ease: "power3.inOut",
      overwrite: "auto",
    });

    // Animate IN the incoming slide's text and content
    const slideEl = slideRefs.current[index];
    if (slideEl) {
      const textEls = slideEl.querySelectorAll("[data-slide-text]");
      const imgEl = slideEl.querySelector("[data-slide-image]");
      const ctaEl = slideEl.querySelector("[data-slide-cta]");

      // Reset to "from" state then animate in
      gsap.set(textEls, { opacity: 0, y: 36, x: -24 });
      gsap.set(imgEl, { opacity: 0, scale: 0.94 });
      gsap.set(ctaEl, { opacity: 0, x: -24 });

      const delay = isTransition ? 0.25 : 0.1;

      gsap.to(textEls, {
        opacity: 1,
        y: 0,
        x: 0,
        duration: 0.65,
        stagger: 0.1,
        ease: "back.out(1.2)",
        delay,
        overwrite: "auto",
      });
      gsap.to(imgEl, {
        opacity: 1,
        scale: 1,
        duration: 0.7,
        ease: "back.out(1.1)",
        delay: delay - 0.05,
        overwrite: "auto",
      });
      gsap.to(ctaEl, {
        opacity: 1,
        x: 0,
        duration: 0.55,
        ease: "back.out(1.4)",
        delay: delay + 0.35,
        overwrite: "auto",
      });
    }

    // Dot indicators
    dotRefs.current.forEach((dot, i) => {
      if (!dot) return;
      gsap.to(dot, {
        width: i === index ? 24 : 8,
        backgroundColor: i === index ? "rgb(245 158 11)" : "rgb(82 82 91)",
        duration: 0.35,
        ease: "power2.out",
      });
    });

    prevIndexRef.current = index;
    isFirstRenderRef.current = false;
  }, [index, products.length]);

  if (loading) {
    return (
      <div className="relative mb-12 flex min-h-[320px] w-full overflow-hidden rounded-2xl border border-zinc-600/40 bg-zinc-950">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:24px_24px]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500/50 border-t-amber-400" />
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="relative mb-12 flex min-h-[320px] w-full overflow-hidden rounded-2xl border border-zinc-600/40 bg-zinc-950">
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

  return (
    <div className="group relative mb-12 w-full overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/5">
      <div className="relative min-h-[320px] md:min-h-[400px] overflow-hidden">
        {/* Lighter slate-blue gradient background */}
        <div
          className="absolute inset-0 z-0"
          style={{
            background:
              "linear-gradient(152deg, #1e293b 0%, #334155 35%, #475569 60%, #334155 85%, #1e293b 100%)",
          }}
        />
        <div
          className="absolute inset-0 z-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 90% 70% at 80% 30%, rgba(99,102,241,0.15) 0%, transparent 50%), radial-gradient(ellipse 70% 80% at 20% 70%, rgba(251,191,36,0.08) 0%, transparent 50%)",
          }}
        />
        <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:32px_32px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black_30%,transparent_70%)]" />

        {/* Moving smoke – above grid, below content */}
        <div
          ref={smokeRef}
          className="pointer-events-none absolute inset-0 z-[1] overflow-hidden"
          aria-hidden
        >
          <div
            data-smoke
            className="absolute left-[10%] top-[15%] h-64 w-80 rounded-full will-change-transform"
            style={{
              background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,255,255,0.12) 0%, rgba(200,210,220,0.06) 40%, transparent 70%)",
              filter: "blur(40px)",
            }}
          />
          <div
            data-smoke
            className="absolute right-[5%] top-[25%] h-80 w-96 rounded-full will-change-transform"
            style={{
              background: "radial-gradient(ellipse 70% 70% at 50% 50%, rgba(255,255,255,0.1) 0%, rgba(180,190,200,0.04) 45%, transparent 75%)",
              filter: "blur(50px)",
            }}
          />
          <div
            data-smoke
            className="absolute bottom-[20%] left-[20%] h-56 w-72 rounded-full will-change-transform"
            style={{
              background: "radial-gradient(ellipse 75% 65% at 50% 50%, rgba(255,255,255,0.08) 0%, rgba(190,200,210,0.03) 50%, transparent 75%)",
              filter: "blur(45px)",
            }}
          />
          <div
            data-smoke
            className="absolute right-[25%] bottom-[10%] h-72 w-80 rounded-full will-change-transform"
            style={{
              background: "radial-gradient(ellipse 65% 80% at 50% 50%, rgba(255,255,255,0.1) 0%, rgba(200,210,220,0.05) 40%, transparent 70%)",
              filter: "blur(48px)",
            }}
          />
          <div
            data-smoke
            className="absolute left-[35%] top-[45%] h-48 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full will-change-transform"
            style={{
              background: "radial-gradient(ellipse 70% 70% at 50% 50%, rgba(255,255,255,0.09) 0%, rgba(210,220,230,0.04) 55%, transparent 80%)",
              filter: "blur(38px)",
            }}
          />
          <div
            data-smoke
            className="absolute right-[15%] top-[55%] h-60 w-72 rounded-full will-change-transform"
            style={{
              background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,255,255,0.07) 0%, rgba(190,200,210,0.03) 50%, transparent 75%)",
              filter: "blur(42px)",
            }}
          />
        </div>

        {/* Slide track */}
        <div
          ref={trackRef}
          className="relative z-10 flex"
          style={{ width: `${products.length * 100}%` }}
        >
          {products.map((product, i) => {
            const imgSrc = product.galleryImages?.[0] || product.images?.default || "/logo.svg";
            const slug = product.slug || productSlug(product.name) || String(product.id);
            const href = `/products/${slug}`;
            const priceStr = typeof product.price === "number" ? `${product.price} kr` : String(product.price);
            const shortDesc = product.shortDescription?.trim() || product.description?.slice(0, 120);

            return (
              <div
                key={product.id}
                ref={(el) => { slideRefs.current[i] = el; }}
                className="flex flex-shrink-0"
                style={{ width: `${100 / products.length}%` }}
              >
                <Link href={href} className="flex min-h-[320px] w-full md:min-h-[400px]">
                  <div className="relative flex w-full flex-col md:flex-row">
                    {/* Text – left */}
                    <div className="flex flex-1 flex-col justify-center pl-10 pr-4 py-8 md:pl-16 md:pr-6 md:py-10">
                      <h2
                        data-slide-text
                        className="text-2xl font-bold tracking-tight text-white md:text-3xl lg:text-4xl"
                      >
                        {product.name}
                      </h2>
                      {shortDesc && (
                        <p
                          data-slide-text
                          className="mt-2 line-clamp-2 text-base text-gray-300 md:text-lg"
                        >
                          {shortDesc}
                        </p>
                      )}
                      <p data-slide-text className="mt-4 text-base text-gray-400">
                        Från
                      </p>
                      <p
                        data-slide-text
                        className="text-3xl font-bold text-amber-400 md:text-4xl"
                      >
                        {priceStr}
                      </p>
                      <span
                        data-slide-cta
                        className="mt-5 inline-flex w-fit items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-amber-500/20 transition-all group-hover:from-amber-400 group-hover:to-orange-400 group-hover:shadow-amber-500/30 group-hover:scale-[1.02]"
                      >
                        Handla nu <ArrowRight className="h-5 w-5" />
                      </span>
                    </div>

                    {/* Product image – right */}
                    <div className="relative flex flex-1 min-w-0 items-center justify-center pl-4 pr-6 py-6 md:pl-6 md:pr-8 md:py-8">
                      <div
                        data-slide-image
                        className="relative h-full w-full min-h-[200px] md:min-h-[280px]"
                      >
                        {/* Soft shadow platform + glow behind product */}
                        <div className="absolute inset-0 -m-8 rounded-2xl bg-[radial-gradient(ellipse_70%_70%_at_50%_50%,rgba(0,0,0,0.15)_0%,transparent_60%)] blur-2xl" />
                        <div className="absolute inset-0 -m-6 rounded-2xl bg-[radial-gradient(ellipse_70%_70%_at_50%_50%,rgba(99,102,241,0.06)_0%,transparent_70%)] blur-xl" />
                        <ImageWithFallback
                          src={imgSrc}
                          alt={product.name}
                          fill
                          className="relative z-10 object-contain object-center transition-transform duration-300 group-hover:scale-[1.03]"
                          style={{
                            filter:
                              "drop-shadow(0 2px 4px rgba(0,0,0,0.2)) drop-shadow(0 8px 16px rgba(0,0,0,0.25)) drop-shadow(0 24px 48px rgba(0,0,0,0.3))",
                          }}
                          sizes="(max-width: 768px) 50vw, (max-width: 1024px) 40vw, 560px"
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      {products.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              goTo(index - 1);
            }}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/15 bg-black/40 p-2.5 text-white/90 backdrop-blur-md transition-all hover:scale-105 hover:bg-amber-500/20 hover:border-amber-400/30 hover:text-white md:opacity-0 md:group-hover:opacity-100"
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
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/15 bg-black/40 p-2.5 text-white/90 backdrop-blur-md transition-all hover:scale-105 hover:bg-amber-500/20 hover:border-amber-400/30 hover:text-white md:opacity-0 md:group-hover:opacity-100"
            aria-label="Next slide"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
            {products.map((_, i) => (
              <button
                key={i}
                ref={(el) => { dotRefs.current[i] = el; }}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  goTo(i);
                }}
                className="h-2 rounded-full bg-zinc-600 transition-colors hover:bg-zinc-500"
                style={{ width: i === index ? 24 : 8 }}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
