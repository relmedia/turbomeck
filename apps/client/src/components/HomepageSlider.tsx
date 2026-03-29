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

type HomepageSliderProps = {
  /** Server-fetched slider products (same locale as cookie) — avoids client waterfall for LCP */
  initialProducts?: ProductType[];
};

export function HomepageSlider({ initialProducts = [] }: HomepageSliderProps) {
  const { locale, t } = useLanguage();
  const reducedMotion = useReducedMotion();
  const [products, setProducts] = useState<ProductType[]>(initialProducts);
  const [loading, setLoading] = useState(initialProducts.length === 0);
  const skipHydrationRefetchRef = useRef(initialProducts.length > 0);
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const prevIndexRef = useRef(0);
  const isFirstRenderRef = useRef(true);
  const smokeRef = useRef<HTMLDivElement>(null);
  const sliderContainerRef = useRef<HTMLElement>(null);
  const floatTweenRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (skipHydrationRefetchRef.current) {
      skipHydrationRefetchRef.current = false;
      return () => {
        cancelled = true;
      };
    }
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

  // Floating animation for active product image
  useEffect(() => {
    if (reducedMotion || products.length === 0) return;
    
    const slideEl = slideRefs.current[index];
    if (!slideEl) return;
    
    const imgEl = slideEl.querySelector("[data-slide-image]");
    if (!imgEl) return;

    // Kill previous floating animation
    if (floatTweenRef.current) {
      floatTweenRef.current.kill();
    }

    // Create subtle floating animation
    floatTweenRef.current = gsap.to(imgEl, {
      y: -8,
      duration: 2.5,
      ease: "sine.inOut",
      repeat: -1,
      yoyo: true,
    });

    return () => {
      if (floatTweenRef.current) {
        floatTweenRef.current.kill();
      }
    };
  }, [index, products.length, reducedMotion]);

  // Mouse parallax effect
  useEffect(() => {
    if (reducedMotion || !sliderContainerRef.current || products.length === 0) return;

    const container = sliderContainerRef.current;
    
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const mouseX = (e.clientX - centerX) / (rect.width / 2);
      const mouseY = (e.clientY - centerY) / (rect.height / 2);

      const slideEl = slideRefs.current[index];
      if (!slideEl) return;

      const imgEl = slideEl.querySelector("[data-slide-image]");
      const textEls = slideEl.querySelectorAll("[data-slide-text]");

      if (imgEl) {
        gsap.to(imgEl, {
          x: mouseX * 15,
          rotateY: mouseX * 3,
          rotateX: -mouseY * 2,
          duration: 0.6,
          ease: "power2.out",
          overwrite: "auto",
        });
      }

      textEls.forEach((el, i) => {
        gsap.to(el, {
          x: mouseX * (4 + i * 2),
          duration: 0.8,
          ease: "power2.out",
          overwrite: "auto",
        });
      });
    };

    const handleMouseLeave = () => {
      const slideEl = slideRefs.current[index];
      if (!slideEl) return;

      const imgEl = slideEl.querySelector("[data-slide-image]");
      const textEls = slideEl.querySelectorAll("[data-slide-text]");

      if (imgEl) {
        gsap.to(imgEl, {
          x: 0,
          rotateY: 0,
          rotateX: 0,
          duration: 0.8,
          ease: "power2.out",
          overwrite: "auto",
        });
      }

      textEls.forEach((el) => {
        gsap.to(el, {
          x: 0,
          duration: 0.8,
          ease: "power2.out",
          overwrite: "auto",
        });
      });
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [index, products.length, reducedMotion]);

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
        const track = dot.querySelector("[data-dot-track]") as HTMLElement | null;
        if (track) {
          track.style.height = i === index ? "32px" : "16px";
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
          y: -16,
          x: -10,
          scale: 0.98,
          duration: 0.55,
          stagger: 0.04,
          ease: "power2.inOut",
          overwrite: "auto",
        });
        gsap.to(prevImgEl, {
          opacity: 0,
          scale: 0.92,
          rotateY: -8,
          x: -22,
          duration: 0.6,
          ease: "power2.inOut",
          overwrite: "auto",
        });
        gsap.to(prevCtaEl, {
          opacity: 0,
          y: 12,
          duration: 0.45,
          ease: "power2.inOut",
          overwrite: "auto",
        });
      }
    }

    gsap.to(trackRef.current, {
      xPercent,
      duration: 0.95,
      ease: "power2.inOut",
      overwrite: "auto",
    });

    const slideEl = slideRefs.current[index];
    if (slideEl) {
      const textEls = slideEl.querySelectorAll("[data-slide-text]");
      const imgEl = slideEl.querySelector("[data-slide-image]");
      const ctaEl = slideEl.querySelector("[data-slide-cta]");

      gsap.set(textEls, { opacity: 0, y: 28, x: -18, scale: 0.98 });
      gsap.set(imgEl, { opacity: 0, scale: 0.92, rotateY: 10, x: 28 });
      gsap.set(ctaEl, { opacity: 0, y: 18, scale: 0.98 });

      const delay = isTransition ? 0.14 : 0.06;

      gsap.to(textEls, {
        opacity: 1,
        y: 0,
        x: 0,
        scale: 1,
        duration: 0.88,
        stagger: 0.07,
        ease: "power2.out",
        delay,
        overwrite: "auto",
      });
      gsap.to(imgEl, {
        opacity: 1,
        scale: 1,
        rotateY: 0,
        x: 0,
        duration: 1,
        ease: "sine.out",
        delay: delay + 0.04,
        overwrite: "auto",
      });
      gsap.to(ctaEl, {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.72,
        ease: "power2.out",
        delay: delay + 0.22,
        overwrite: "auto",
      });
    }

    dotRefs.current.forEach((dot, i) => {
      if (!dot) return;
      const track = dot.querySelector("[data-dot-track]") as HTMLElement | null;
      if (!track) return;
      gsap.to(track, {
        height: i === index ? 32 : 16,
        duration: 0.55,
        ease: "power2.inOut",
      });
    });

    prevIndexRef.current = index;
    isFirstRenderRef.current = false;
  }, [index, products.length, reducedMotion]);

  if (loading) {
    return (
      <div
        className="relative mb-12 flex min-h-[300px] w-full overflow-hidden shadow-lg md:min-h-[400px]"
        style={{ background: "linear-gradient(135deg, #f5f5f5 0%, #ebebeb 30%, #f0f0f0 60%, #e8e8e8 100%)" }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div 
        className="relative mb-12 flex min-h-[300px] w-full overflow-hidden shadow-lg md:min-h-[400px]"
        style={{ background: "linear-gradient(135deg, #f5f5f5 0%, #ebebeb 30%, #f0f0f0 60%, #e8e8e8 100%)" }}
      >
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
      ref={sliderContainerRef}
      className="group/slider relative mb-12 w-full overflow-hidden shadow-lg border border-gray-200"
      style={{ perspective: "1000px" }}
      aria-roledescription="carousel"
      aria-label={t("slider.regionLabel")}
    >
      <div className="relative min-h-[320px] md:min-h-[420px] overflow-hidden">

        {/* Light textured background */}
        <div className="absolute inset-0 z-0">
          {/* Base light gradient */}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, #f5f5f5 0%, #ebebeb 30%, #f0f0f0 60%, #e8e8e8 100%)" }}
          />
          {/* Abstract diagonal lines */}
          <div
            className="absolute inset-0 overflow-hidden"
            aria-hidden
          >
            {/* Long diagonal line - top */}
            <div 
              className="absolute h-[2px] w-[600px] bg-gradient-to-r from-transparent via-gray-300 to-transparent"
              style={{ top: "15%", left: "-5%", transform: "rotate(-25deg)" }}
            />
            {/* Short accent line */}
            <div 
              className="absolute h-[3px] w-[150px] bg-gradient-to-r from-gray-400 to-transparent"
              style={{ top: "25%", left: "8%", transform: "rotate(-25deg)" }}
            />
            {/* Curved arc - right side */}
            <div 
              className="absolute h-[400px] w-[400px] rounded-full border-2 border-gray-200"
              style={{ top: "-20%", right: "-15%", opacity: 0.5 }}
            />
            {/* Small circle accent */}
            <div 
              className="absolute h-[80px] w-[80px] rounded-full border border-gray-300"
              style={{ bottom: "20%", left: "5%", opacity: 0.4 }}
            />
            {/* Horizontal thin line */}
            <div 
              className="absolute h-[1px] w-[200px] bg-gradient-to-r from-transparent via-gray-400 to-transparent"
              style={{ bottom: "35%", left: "15%" }}
            />
            {/* Dotted vertical accent */}
            <div 
              className="absolute w-[2px] h-[100px]"
              style={{ 
                top: "30%", 
                right: "25%",
                backgroundImage: "linear-gradient(to bottom, transparent 50%, rgba(150,150,150,0.3) 50%)",
                backgroundSize: "2px 8px"
              }}
            />
            {/* Opposing diagonal - bottom right */}
            <div 
              className="absolute h-[1px] w-[480px] bg-gradient-to-r from-transparent via-gray-400/60 to-transparent"
              style={{ bottom: "12%", right: "-8%", transform: "rotate(18deg)" }}
            />
            {/* Zigzag band */}
            <div
              className="absolute left-[12%] top-[55%] h-12 w-40 opacity-30"
              style={{
                backgroundImage: `repeating-linear-gradient(
                  135deg,
                  transparent,
                  transparent 6px,
                  rgba(120,120,120,0.35) 6px,
                  rgba(120,120,120,0.35) 7px
                )`,
              }}
            />
            {/* Ellipse outline */}
            <div
              className="absolute rounded-[100%] border border-gray-300/50"
              style={{ width: "280px", height: "120px", bottom: "8%", right: "12%", transform: "rotate(-8deg)" }}
            />
            {/* Parallel hatch - left */}
            <div
              className="absolute left-0 top-[40%] h-32 w-24 opacity-25"
              style={{
                backgroundImage: `repeating-linear-gradient(
                  90deg,
                  transparent,
                  transparent 11px,
                  rgba(100,100,100,0.25) 11px,
                  rgba(100,100,100,0.25) 12px
                )`,
              }}
            />
            {/* Short perpendicular L-shape */}
            <div
              className="absolute border-l-2 border-b-2 border-gray-300/60"
              style={{ width: "48px", height: "48px", top: "18%", right: "35%" }}
            />
            {/* Dashed arc segment (quarter circle stroke) */}
            <div
              className="absolute rounded-full border border-dashed border-gray-300/70"
              style={{ width: "180px", height: "180px", bottom: "-8%", left: "22%", clipPath: "polygon(0 0, 50% 0, 50% 50%, 0 50%)" }}
            />
            {/* Thin crossing lines */}
            <div
              className="absolute h-[120px] w-[1px] bg-gradient-to-b from-transparent via-gray-400/40 to-transparent"
              style={{ left: "42%", top: "8%" }}
            />
            <div
              className="absolute h-[1px] w-[160px] bg-gradient-to-r from-gray-400/30 to-transparent"
              style={{ left: "38%", top: "22%" }}
            />
            {/* Stepped / broken line */}
            <div
              className="absolute opacity-35"
              style={{
                top: "65%",
                right: "8%",
                width: "120px",
                height: "3px",
                background: `repeating-linear-gradient(
                  90deg,
                  rgba(90,90,90,0.45) 0px,
                  rgba(90,90,90,0.45) 14px,
                  transparent 14px,
                  transparent 22px
                )`,
                transform: "rotate(-12deg)",
              }}
            />
            {/* Soft grid fragment */}
            <div
              className="absolute right-[5%] top-[12%] h-24 w-24 opacity-20"
              style={{
                backgroundImage: `
                  linear-gradient(0deg, rgba(130,130,130,0.4) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(130,130,130,0.4) 1px, transparent 1px)
                `,
                backgroundSize: "10px 10px",
              }}
            />
          </div>
        </div>

        {/* Subtle ambient shadows */}
        <div
          ref={smokeRef}
          className="pointer-events-none absolute inset-0 z-[2] overflow-hidden"
          aria-hidden
        >
          <div
            data-smoke
            className="absolute left-[10%] top-[40%] h-48 w-64 rounded-full will-change-transform opacity-20"
            style={{
              background: "radial-gradient(ellipse at center, rgba(0,0,0,0.08) 0%, transparent 70%)",
              filter: "blur(40px)",
            }}
          />
          <div
            data-smoke
            className="absolute right-[20%] bottom-[30%] h-56 w-72 rounded-full will-change-transform opacity-15"
            style={{
              background: "radial-gradient(ellipse at center, rgba(0,0,0,0.06) 0%, transparent 70%)",
              filter: "blur(50px)",
            }}
          />
        </div>

        {products.length > 1 && (
          <p
            className="pointer-events-none absolute left-14 top-5 z-30 text-[11px] font-medium tabular-nums tracking-wider text-gray-400 md:left-20 md:top-6"
            aria-live="polite"
          >
            {String(index + 1).padStart(2, "0")} / {String(products.length).padStart(2, "0")}
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
                  className="flex min-h-[320px] w-full focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100 md:min-h-[420px]"
                >
                  <div className="relative flex w-full flex-col md:flex-row">
                    {/* Left content */}
                    <div className="relative flex flex-1 flex-col justify-center px-6 py-8 md:max-w-[55%] md:pl-10 md:pr-0 md:py-10 lg:pl-14">
                      <h2 data-slide-text className="flex flex-col gap-1">
                        <span 
                          className="text-3xl font-black uppercase italic leading-none tracking-tight text-gray-900 md:text-5xl lg:text-6xl"
                          style={{
                            textShadow: "3px 3px 0 rgba(0,0,0,0.15), 5px 5px 0 rgba(0,0,0,0.08)",
                          }}
                        >
                          {product.name.split(" ").slice(0, 2).join(" ")}
                        </span>
                        <span 
                          className="text-2xl font-black uppercase italic leading-none tracking-tight md:text-4xl lg:text-5xl"
                          style={{
                            WebkitTextStroke: "1.5px #1a1a1a",
                            WebkitTextFillColor: "transparent",
                            textShadow: "2px 2px 0 rgba(0,0,0,0.05)",
                          }}
                        >
                          {product.name.split(" ").slice(2).join(" ") || "TURBO"}
                        </span>
                      </h2>
                      
                      {shortDesc && (
                        <p
                          data-slide-text
                          className="mt-5 max-w-sm text-xs italic leading-relaxed text-gray-500 md:mt-6 md:text-sm"
                        >
                          {shortDesc}
                        </p>
                      )}
                      
                      <div data-slide-text className="mt-6 flex flex-wrap items-center gap-5 md:mt-8">
                        <span
                          data-slide-cta
                          className="group/btn relative isolate inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-full bg-gray-900 px-7 py-3 text-sm font-semibold uppercase tracking-wider text-white ring-1 ring-white/0 transition-all duration-300 ring-offset-2 ring-offset-gray-100 hover:-translate-y-0.5 hover:ring-white/15 hover:shadow-lg hover:shadow-gray-900/25 active:translate-y-0 active:scale-[0.99] md:px-8 md:py-3.5"
                        >
                          {/* Brand tint */}
                          <span
                            className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-[rgb(110,201,0)]/0 via-[rgb(110,201,0)]/12 to-[rgb(110,201,0)]/0 opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100"
                            aria-hidden
                          />
                          {/* Shimmer sweep */}
                          <span className="pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-full" aria-hidden>
                            <span className="absolute inset-y-0 -left-1/3 w-1/2 -translate-x-full skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover/btn:translate-x-[320%]" />
                          </span>
                          <span className="relative z-[2]">{t("account.shopNow")}</span>
                          <ArrowRight
                            className="relative z-[2] h-4 w-4 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/btn:translate-x-1"
                            strokeWidth={2.5}
                            aria-hidden
                          />
                        </span>
                        <span className="text-xl font-bold tabular-nums tracking-tight text-gray-900 md:text-2xl">
                          {priceStr}
                        </span>
                      </div>
                    </div>

                    {/* Right image */}
                    <div className="relative flex min-h-[240px] flex-1 items-center justify-start px-2 pb-6 pt-0 md:min-h-0 md:pl-0 md:pr-8 md:py-4" style={{ perspective: "800px" }}>
                      <div
                        data-slide-image
                        className="relative z-10 h-full w-full min-h-[220px] md:min-h-[380px]"
                        style={{ transformStyle: "preserve-3d" }}
                      >
                        <ImageWithFallback
                          src={imgSrc}
                          alt=""
                          fill
                          priority={i === 0}
                          fetchPriority={i === 0 ? "high" : "low"}
                          className="relative z-10 object-contain object-center transition-transform duration-700 ease-out group-hover/slider:scale-[1.04]"
                          style={{
                            filter: "drop-shadow(0 10px 30px rgba(0,0,0,0.6)) drop-shadow(0 30px 60px rgba(0,0,0,0.4))",
                          }}
                          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 600px"
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
          {/* Arrow navigation - bottom right, appears on hover */}
          <div className="absolute bottom-6 right-16 z-40 flex items-center gap-2 opacity-0 transition-opacity duration-300 group-hover/slider:opacity-100 md:bottom-8 md:right-20">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                goTo(index - 1);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 shadow-sm transition-all duration-200 hover:bg-gray-900 hover:text-white hover:border-gray-900 active:scale-95"
              aria-label={t("slider.prevSlide")}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                goTo(index + 1);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 shadow-sm transition-all duration-200 hover:bg-gray-900 hover:text-white hover:border-gray-900 active:scale-95"
              aria-label={t("slider.nextSlide")}
            >
              <ChevronRight className="h-4 w-4" aria-hidden strokeWidth={2.5} />
            </button>
          </div>
          {/* Vertical timeline + slide indicators */}
          <div className="absolute right-4 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center md:right-6">
            {products.map((_, i) => (
              <div key={i} className="flex flex-col items-center">
                {i > 0 && (
                  <div
                    className="h-3 w-px bg-gradient-to-b from-gray-300/50 to-gray-300/80"
                    aria-hidden
                  />
                )}
                <button
                  ref={(el) => { dotRefs.current[i] = el; }}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    goTo(i);
                  }}
                  className="group/dot flex items-center gap-2 py-0.5"
                  aria-label={t("slider.goToSlide", { n: i + 1 })}
                  aria-current={i === index ? "true" : undefined}
                >
                  <span
                    className="text-xs font-medium tabular-nums transition-all duration-300"
                    style={{
                      color: i === index ? "rgb(110, 201, 0)" : "rgba(0,0,0,0.25)",
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    data-dot-track
                    className="relative block w-[3px] overflow-hidden rounded-full bg-black/12"
                    style={{ height: i === index ? 32 : 16 }}
                  >
                    {i === index && reducedMotion && (
                      <span
                        className="absolute inset-0 rounded-full bg-[rgb(110,201,0)]"
                        style={{ boxShadow: "0 2px 8px rgba(110, 201, 0, 0.4)" }}
                      />
                    )}
                    {i === index && !reducedMotion && (
                      <span
                        key={index}
                        className="absolute inset-0 origin-top rounded-full bg-[rgb(110,201,0)]"
                        style={{
                          animation: `homepage-slider-timeline-fill ${AUTO_ADVANCE_MS}ms linear forwards`,
                          boxShadow: "0 2px 8px rgba(110, 201, 0, 0.4)",
                        }}
                      />
                    )}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Bottom dark accent bar */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-2 md:h-3 bg-gray-900"
        aria-hidden
      />
    </section>
  );
}
