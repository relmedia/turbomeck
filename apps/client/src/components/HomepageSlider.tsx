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

function formatPriceKr(price: string | number, locale: "sv" | "en"): string {
  if (typeof price === "number") {
    return `${new Intl.NumberFormat(locale === "en" ? "en-GB" : "sv-SE", {
      maximumFractionDigits: 0,
    }).format(price)} kr`;
  }
  return String(price);
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const fn = () => setReduced(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return reduced;
}

const AUTO_ADVANCE_MS = 6000;

export function HomepageSlider() {
  const { locale, t } = useLanguage();
  const reducedMotion = useReducedMotion();
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

  useEffect(() => {
    if (reducedMotion || !smokeRef.current || products.length === 0) return;
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

    return () => tweens.forEach((tw) => tw.kill());
  }, [products.length, reducedMotion]);

  useEffect(() => {
    if (!trackRef.current || products.length === 0) return;

    const slideWidth = 100 / products.length;
    const xPercent = -index * slideWidth;
    const prevIndex = prevIndexRef.current;
    const isTransition = prevIndex !== index;

    if (reducedMotion) {
      gsap.set(trackRef.current, { xPercent });
      slideRefs.current.forEach((el) => {
        if (!el) return;
        const textEls = el.querySelectorAll("[data-slide-text]");
        const imgEl = el.querySelector("[data-slide-image]");
        const ctaEl = el.querySelector("[data-slide-cta]");
        gsap.set(textEls, { opacity: 1, y: 0, x: 0 });
        if (imgEl) gsap.set(imgEl, { opacity: 1, scale: 1 });
        if (ctaEl) gsap.set(ctaEl, { opacity: 1, x: 0 });
      });
      dotRefs.current.forEach((dot, i) => {
        if (!dot) return;
        const inner = dot.querySelector("[data-dot-inner]") as HTMLElement | null;
        if (inner) {
          inner.style.width = i === index ? "24px" : "8px";
          inner.style.backgroundColor = i === index ? "rgb(245 158 11)" : "rgb(82 82 91)";
        }
      });
      prevIndexRef.current = index;
      isFirstRenderRef.current = false;
      return;
    }

    if (isTransition && !isFirstRenderRef.current) {
      const prevSlideEl = slideRefs.current[prevIndex];
      if (prevSlideEl) {
        const prevTextEls = prevSlideEl.querySelectorAll("[data-slide-text]");
        const prevImgEl = prevSlideEl.querySelector("[data-slide-image]");
        const prevCtaEl = prevSlideEl.querySelector("[data-slide-cta]");

        gsap.to(prevTextEls, {
          opacity: 0,
          y: -24,
          x: -10,
          scale: 0.99,
          duration: 0.32,
          stagger: 0.04,
          ease: "power2.in",
          overwrite: "auto",
        });
        gsap.to(prevImgEl, { opacity: 0, scale: 0.97, duration: 0.28, ease: "power2.in", overwrite: "auto" });
        gsap.to(prevCtaEl, { opacity: 0, x: -8, duration: 0.2, ease: "power2.in", overwrite: "auto" });
      }
    }

    gsap.to(trackRef.current, {
      xPercent,
      duration: 0.65,
      ease: "power3.inOut",
      overwrite: "auto",
    });

    const slideEl = slideRefs.current[index];
    if (slideEl) {
      const textEls = slideEl.querySelectorAll("[data-slide-text]");
      const imgEl = slideEl.querySelector("[data-slide-image]");
      const ctaEl = slideEl.querySelector("[data-slide-cta]");

      gsap.set(textEls, { opacity: 0, y: 28, x: -16 });
      gsap.set(imgEl, { opacity: 0, scale: 0.96 });
      gsap.set(ctaEl, { opacity: 0, x: -16 });

      const delay = isTransition ? 0.22 : 0.08;

      gsap.to(textEls, {
        opacity: 1,
        y: 0,
        x: 0,
        duration: 0.58,
        stagger: 0.08,
        ease: "power3.out",
        delay,
        overwrite: "auto",
      });
      gsap.to(imgEl, {
        opacity: 1,
        scale: 1,
        duration: 0.62,
        ease: "power2.out",
        delay: delay - 0.04,
        overwrite: "auto",
      });
      gsap.to(ctaEl, {
        opacity: 1,
        x: 0,
        duration: 0.48,
        ease: "power2.out",
        delay: delay + 0.28,
        overwrite: "auto",
      });
    }

    dotRefs.current.forEach((dot, i) => {
      if (!dot) return;
      const inner = dot.querySelector("[data-dot-inner]") as HTMLElement | null;
      if (!inner) return;
      gsap.to(inner, {
        width: i === index ? 24 : 8,
        backgroundColor: i === index ? "rgb(245 158 11)" : "rgb(82 82 91)",
        duration: 0.32,
        ease: "power2.out",
      });
    });

    prevIndexRef.current = index;
    isFirstRenderRef.current = false;
  }, [index, products.length, reducedMotion]);

  if (loading) {
    return (
      <div className="relative mb-12 flex min-h-[320px] w-full overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-xl">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:24px_24px]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500/40 border-t-amber-400" />
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="relative mb-12 flex min-h-[320px] w-full overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-xl">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:24px_24px]" />
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
    <section
      className="group/slider relative mb-12 w-full overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl ring-1 ring-white/[0.07]"
      aria-roledescription="carousel"
      aria-label={t("slider.regionLabel")}
    >
      <div className="relative min-h-[320px] md:min-h-[400px] overflow-hidden">
        {/* Autoplay progress */}
        {products.length > 1 && !reducedMotion && (
          <div
            className="absolute left-0 right-0 top-0 z-30 h-0.5 bg-white/10"
            aria-hidden
          >
            <div
              key={index}
              className="homepage-slider-progress-fill h-full origin-left rounded-full bg-gradient-to-r from-amber-400 to-amber-500"
              style={{
                animation: `homepage-slider-progress ${AUTO_ADVANCE_MS}ms linear forwards`,
              }}
            />
          </div>
        )}

        <div
          className="absolute inset-0 z-0"
          style={{
            background:
              "linear-gradient(160deg, #18181b 0%, #27272a 42%, #3f3f46 100%)",
          }}
        />
        <div
          className="absolute inset-0 z-0 opacity-90"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 85% 65% at 85% 20%, rgba(251,191,36,0.07) 0%, transparent 45%), radial-gradient(ellipse 70% 70% at 10% 80%, rgba(99,102,241,0.06) 0%, transparent 50%)",
          }}
        />
        <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:28px_28px] [mask-image:radial-gradient(ellipse_85%_85%_at_50%_45%,black_25%,transparent_72%)]" />

        <div
          ref={smokeRef}
          className="pointer-events-none absolute inset-0 z-[1] overflow-hidden opacity-80"
          aria-hidden
        >
          <div
            data-smoke
            className="absolute left-[10%] top-[15%] h-64 w-80 rounded-full will-change-transform"
            style={{
              background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,255,255,0.08) 0%, rgba(200,210,220,0.04) 40%, transparent 70%)",
              filter: "blur(44px)",
            }}
          />
          <div
            data-smoke
            className="absolute right-[5%] top-[25%] h-80 w-96 rounded-full will-change-transform"
            style={{
              background: "radial-gradient(ellipse 70% 70% at 50% 50%, rgba(255,255,255,0.06) 0%, rgba(180,190,200,0.03) 45%, transparent 75%)",
              filter: "blur(52px)",
            }}
          />
          <div
            data-smoke
            className="absolute bottom-[18%] left-[18%] h-56 w-72 rounded-full will-change-transform"
            style={{
              background: "radial-gradient(ellipse 75% 65% at 50% 50%, rgba(255,255,255,0.05) 0%, rgba(190,200,210,0.02) 50%, transparent 75%)",
              filter: "blur(48px)",
            }}
          />
          <div
            data-smoke
            className="absolute right-[22%] bottom-[12%] h-72 w-80 rounded-full will-change-transform"
            style={{
              background: "radial-gradient(ellipse 65% 80% at 50% 50%, rgba(255,255,255,0.06) 0%, rgba(200,210,220,0.03) 40%, transparent 70%)",
              filter: "blur(46px)",
            }}
          />
        </div>

        {products.length > 1 && (
          <p
            className="pointer-events-none absolute right-4 top-4 z-30 rounded-md bg-black/35 px-2.5 py-1 text-[11px] font-medium tabular-nums tracking-wide text-white/80 backdrop-blur-md md:right-5 md:top-5"
            aria-live="polite"
          >
            {t("slider.position", { current: index + 1, total: products.length })}
          </p>
        )}

        <div
          ref={trackRef}
          className="relative z-10 flex"
          style={{ width: `${products.length * 100}%` }}
        >
          {products.map((product, i) => {
            const imgSrc = product.galleryImages?.[0] || product.images?.default || "/logo.svg";
            const slug = product.slug || productSlug(product.name) || String(product.id);
            const href = `/products/${slug}`;
            const priceStr = formatPriceKr(product.price, locale);
            const shortDesc = product.shortDescription?.trim() || product.description?.slice(0, 120);

            return (
              <div
                key={product.id}
                ref={(el) => { slideRefs.current[i] = el; }}
                className="flex flex-shrink-0"
                style={{ width: `${100 / products.length}%` }}
              >
                <Link
                  href={href}
                  className="flex min-h-[320px] w-full rounded-2xl focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 md:min-h-[400px]"
                >
                  <div className="relative flex w-full flex-col md:flex-row">
                    <div className="relative flex flex-1 flex-col justify-center px-6 py-8 pl-8 pr-5 md:max-w-[52%] md:px-12 md:py-10 md:pl-14">
                      <div
                        className="pointer-events-none absolute inset-y-6 left-3 w-px bg-gradient-to-b from-transparent via-white/12 to-transparent md:left-4"
                        aria-hidden
                      />
                      <p
                        data-slide-text
                        className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-400/90"
                      >
                        {t("slider.featured")}
                      </p>
                      <h2
                        data-slide-text
                        className="mt-3 text-balance text-2xl font-semibold leading-[1.15] tracking-tight text-white md:text-3xl lg:text-[2rem]"
                      >
                        {product.name}
                      </h2>
                      {shortDesc && (
                        <p
                          data-slide-text
                          className="mt-3 max-w-xl text-pretty text-sm leading-relaxed text-zinc-400 md:text-base"
                        >
                          {shortDesc}
                        </p>
                      )}
                      <div data-slide-text className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-sm font-medium text-zinc-500">{t("slider.from")}</span>
                        <span className="text-2xl font-semibold tabular-nums tracking-tight text-white md:text-3xl">
                          {priceStr}
                        </span>
                      </div>
                      <span
                        data-slide-cta
                        className="mt-6 inline-flex w-fit items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 shadow-lg shadow-black/25 transition-[transform,box-shadow,background-color] duration-200 hover:bg-zinc-100 hover:shadow-black/30 active:scale-[0.98] md:px-6 md:py-3 md:text-[0.95rem]"
                      >
                        {t("account.shopNow")}
                        <ArrowRight className="h-4 w-4 shrink-0 opacity-80 md:h-[1.05rem] md:w-[1.05rem]" strokeWidth={2.25} />
                      </span>
                    </div>

                    <div className="relative flex min-h-[220px] flex-1 items-center justify-center px-5 pb-8 pt-2 md:min-h-0 md:px-10 md:pb-10 md:pt-8">
                      <div
                        data-slide-image
                        className="relative h-full w-full min-h-[200px] md:min-h-[280px]"
                      >
                        <div
                          className="absolute inset-0 -m-6 rounded-[1.75rem] md:-m-8"
                          style={{
                            background:
                              "radial-gradient(ellipse 72% 72% at 50% 55%, rgba(0,0,0,0.22) 0%, transparent 62%), radial-gradient(ellipse 55% 55% at 50% 75%, rgba(251,191,36,0.06) 0%, transparent 70%)",
                            filter: "blur(24px)",
                          }}
                          aria-hidden
                        />
                        <div
                          className="absolute inset-2 rounded-2xl ring-1 ring-white/[0.06] md:inset-4"
                          aria-hidden
                        />
                        <ImageWithFallback
                          src={imgSrc}
                          alt=""
                          fill
                          className="relative z-10 object-contain object-center transition-transform duration-500 ease-out group-hover/slider:scale-[1.02]"
                          style={{
                            filter:
                              "drop-shadow(0 4px 6px rgba(0,0,0,0.15)) drop-shadow(0 12px 24px rgba(0,0,0,0.2))",
                          }}
                          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 45vw, 520px"
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
            className="absolute left-2 top-1/2 z-40 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-zinc-950/75 text-white shadow-lg shadow-black/40 backdrop-blur-md transition-[transform,background-color,border-color,opacity] duration-200 hover:border-amber-400/35 hover:bg-zinc-900/90 hover:text-white active:scale-95 md:left-4 md:h-12 md:w-12 md:opacity-0 md:shadow-xl md:group-hover/slider:opacity-100 md:focus-visible:opacity-100"
            aria-label={t("slider.prevSlide")}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              goTo(index + 1);
            }}
            className="absolute right-2 top-1/2 z-40 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-zinc-950/75 text-white shadow-lg shadow-black/40 backdrop-blur-md transition-[transform,background-color,border-color,opacity] duration-200 hover:border-amber-400/35 hover:bg-zinc-900/90 hover:text-white active:scale-95 md:right-4 md:h-12 md:w-12 md:opacity-0 md:shadow-xl md:group-hover/slider:opacity-100 md:focus-visible:opacity-100"
            aria-label={t("slider.nextSlide")}
          >
            <ChevronRight className="h-5 w-5" aria-hidden strokeWidth={2.25} />
          </button>
          <div className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-white/10 bg-zinc-950/65 px-2 py-2 backdrop-blur-md md:bottom-5">
            {products.map((_, i) => (
              <button
                key={i}
                ref={(el) => { dotRefs.current[i] = el; }}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  goTo(i);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/5"
                aria-label={t("slider.goToSlide", { n: i + 1 })}
                aria-current={i === index ? "true" : undefined}
              >
                <span
                  data-dot-inner
                  className="block h-2 rounded-full bg-zinc-600"
                  style={{ width: i === index ? 24 : 8 }}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
