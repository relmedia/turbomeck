"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchSliderProducts } from "@/lib/api";
import { useLanguage } from "@/i18n/context";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { ProductType } from "@/types";
import { ImageWithFallback } from "./ImageWithFallback";
import { Floating3DParticles } from "@/components/ui/floating-3d-particles";

/**
 * The hero is dark on purpose, and that is the whole design.
 *
 * Every product photo in the catalogue is a transparent cut-out of a bare,
 * unpainted metal part — turbos, wastegates, housings — in silver-grey cast
 * iron. On the light grey ground this hero used to have, grey metal sat on grey
 * background and the silhouette dissolved; the only thing separating the two
 * was a very heavy drop-shadow, which reads as smudge rather than depth. On a
 * near-black ground the same photo reads as studio work, with no reshoot.
 *
 * Deeper and cooler than `BRAND.inkDeep`, which is tuned for the landing-page
 * cards sitting on white. Those cards need to stay a panel; this needs to stop
 * being a panel and become a room, so the part has somewhere to sit.
 */
const GROUND =
  "linear-gradient(115deg, #16181b 0%, #232730 45%, #171a1f 100%)";

/**
 * One off-centre light, placed where the product sits. It is what keeps the
 * ground from reading as flat colour. Kept at 10% — a brighter version washed
 * out the left half of the oversized name behind the part.
 */
const SHEEN =
  "radial-gradient(60% 90% at 70% 36%, rgba(255,255,255,0.10) 0%, transparent 65%)";

/**
 * The drifting motes take the sheen's colour, not the brand green — they are
 * lit dust, and dust is the colour of the light falling on it. Green motes read
 * as decoration stuck on top of the photograph.
 */
const PARTICLE_COLOR = "#cfe3f5";

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

/**
 * The display name is split over two lines: a solid first line and an outlined
 * second one. Two-word names simply get one line — the previous fallback
 * printed the literal word "TURBO" under every short name, which produced
 * "BENSINPUMP RACING / TURBO" on a fuel pump.
 */
function splitName(name: string): [string, string] {
  const words = name.split(" ");
  return [words.slice(0, 2).join(" "), words.slice(2).join(" ")];
}

function formatPriceKr(price: string | number, locale: "sv" | "en"): string {
  if (typeof price === "number") {
    return `${new Intl.NumberFormat(locale === "en" ? "en-GB" : "sv-SE", {
      maximumFractionDigits: 0,
    }).format(price)} kr`;
  }
  return String(price);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
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

/** Sizes hint for the hero shot. */
const SHOT_SIZES = "(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 600px";

type HomepageSliderProps = {
  /** Server-fetched slider products (same locale as cookie) — avoids client waterfall for LCP */
  initialProducts?: ProductType[];
};

export function HomepageSlider({ initialProducts = [] }: HomepageSliderProps) {
  const { locale, t } = useLanguage();
  const { price: displayPrice } = useCurrency();
  const reducedMotion = useReducedMotion();
  const [products, setProducts] = useState<ProductType[]>(initialProducts);
  const [loading, setLoading] = useState(initialProducts.length === 0);
  const skipHydrationRefetchRef = useRef(initialProducts.length > 0);
  /**
   * Which slide is showing. Runs 0..products.length-1.
   *
   * This used to be a track position distinct from the product index, because
   * the track carried a trailing clone of the first slide to make the wrap
   * travel forwards. The track is cut rather than slid now, so there is no
   * sweep to hide and `pos` and `index` are the same number — `index` is kept
   * only because it guards against a zero-length product list.
   */
  const [pos, setPos] = useState(0);
  const index = products.length > 0 ? pos % products.length : 0;
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const prevIndexRef = useRef(0);
  const isFirstRenderRef = useRef(true);
  const sliderContainerRef = useRef<HTMLElement>(null);
  const floatTweenRef = useRef<gsap.core.Tween | null>(null);
  /** The pending "cut the track" call between slides, so it can be cancelled. */
  const cutCallRef = useRef<gsap.core.Tween | null>(null);

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

  /** Jump straight to a product. Used by the numbered rail, where a jump is
   *  what the reader asked for. */
  const goTo = useCallback(
    (i: number) => {
      if (products.length === 0) return;
      const next = ((i % products.length) + products.length) % products.length;
      if (next === index) return;
      setPos(next);
    },
    [products.length, index]
  );

  /**
   * One step forward, wrapping directly.
   *
   * There used to be a trailing clone of the first slide here so the wrap
   * could travel forwards instead of sweeping back across everything. The
   * track no longer travels — slides are cut, not slid — so there is nothing
   * for the detour to smooth over and the clone is gone.
   */
  const goNext = useCallback(() => {
    if (products.length <= 1) return;
    setPos((p) => (p + 1) % products.length);
  }, [products.length]);

  /** One step back. No re-seating needed now that the track is cut, not slid. */
  const goPrev = useCallback(() => {
    if (products.length <= 1) return;
    setPos((p) => (p === 0 ? products.length - 1 : p - 1));
  }, [products.length]);

  useEffect(() => {
    if (products.length <= 1) return;
    const id = setInterval(goNext, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [products.length, pos, goNext]);

  // Floating animation for active product image
  useEffect(() => {
    if (reducedMotion || products.length === 0) return;

    const slideEl = slideRefs.current[pos];
    if (!slideEl) return;

    const imgEl = slideEl.querySelector("[data-slide-image]");
    if (!imgEl) return;

    if (floatTweenRef.current) {
      floatTweenRef.current.kill();
    }

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
  }, [pos, products.length, reducedMotion]);

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

      const slideEl = slideRefs.current[pos];
      if (!slideEl) return;

      const imgEl = slideEl.querySelector("[data-slide-image]");
      const textEls = slideEl.querySelectorAll("[data-slide-text]");
      const typeEl = slideEl.querySelector("[data-slide-megatype]");

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

      // The oversized name drifts against the part, which is what sells the
      // depth between the two layers.
      if (typeEl) {
        gsap.to(typeEl, {
          x: mouseX * -18,
          duration: 1,
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
      const slideEl = slideRefs.current[pos];
      if (!slideEl) return;

      const imgEl = slideEl.querySelector("[data-slide-image]");
      const textEls = slideEl.querySelectorAll("[data-slide-text]");
      const typeEl = slideEl.querySelector("[data-slide-megatype]");

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

      if (typeEl) {
        gsap.to(typeEl, { x: 0, duration: 1, ease: "power2.out", overwrite: "auto" });
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
  }, [pos, products.length, reducedMotion]);

  useEffect(() => {
    if (!trackRef.current || products.length === 0) return;

    /**
     * A cut still pending from the previous change would fire after this one
     * and slam the track back to the old position. Rapid clicking on the
     * arrows is exactly how a user finds that.
     */
    cutCallRef.current?.kill();
    cutCallRef.current = null;

    const slideWidth = 100 / products.length;
    const xPercent = -pos * slideWidth;
    const prevIndex = prevIndexRef.current;
    const isTransition = prevIndex !== pos;

    if (reducedMotion) {
      gsap.set(trackRef.current, { xPercent });
      slideRefs.current.forEach((el) => {
        if (!el) return;
        const textEls = el.querySelectorAll("[data-slide-text]");
        const imgEl = el.querySelector("[data-slide-image]");
        const ctaEl = el.querySelector("[data-slide-cta]");
        const typeEl = el.querySelector("[data-slide-megatype]");
        gsap.set(textEls, { opacity: 1, y: 0, x: 0 });
        if (imgEl) gsap.set(imgEl, { opacity: 1, scale: 1 });
        if (ctaEl) gsap.set(ctaEl, { opacity: 1, x: 0 });
        if (typeEl) gsap.set(typeEl, { opacity: 1, x: 0 });
      });
      dotRefs.current.forEach((dot, i) => {
        if (!dot) return;
        const track = dot.querySelector("[data-dot-track]") as HTMLElement | null;
        if (track) {
          track.style.height = i === index ? "32px" : "16px";
        }
      });
      prevIndexRef.current = pos;
      isFirstRenderRef.current = false;
      return;
    }

    /**
     * The track is CUT between slides, not slid.
     *
     * It used to tween xPercent over 0.95s, which meant every change was
     * dominated by the whole hero sweeping right-to-left. Any per-element
     * motion underneath that was either invisible or fighting it. Now the
     * track is repositioned instantly while nothing is on screen, and the
     * transition is carried entirely by the contents: text fades up from
     * below, the image travels in from the right.
     */
    const EXIT = 0.34;

    const playIn = () => {
      const slideEl = slideRefs.current[pos];
      if (!slideEl) return;
      const textEls = slideEl.querySelectorAll("[data-slide-text]");
      const imgEl = slideEl.querySelector("[data-slide-image]");
      const ctaEl = slideEl.querySelector("[data-slide-cta]");
      const typeEl = slideEl.querySelector("[data-slide-megatype]");

      /**
       * The x/y resets are load-bearing: mouse parallax writes x and y onto
       * these same elements, so a slide entering without them would inherit
       * whatever offset the pointer last left behind.
       */
      gsap.set(textEls, { opacity: 0, x: 0, y: 26, scale: 1 });
      gsap.set(typeEl, { opacity: 0, x: 0, y: 32 });
      gsap.set(ctaEl, { opacity: 0, x: 0, y: 20, scale: 1 });
      gsap.set(imgEl, { opacity: 0, x: 130, y: 0, scale: 1, rotateY: 0 });

      // The name leads, so the smaller copy lands on top of it.
      gsap.to(typeEl, { opacity: 1, y: 0, duration: 0.9, ease: "power2.out", overwrite: "auto" });
      gsap.to(textEls, {
        opacity: 1,
        y: 0,
        duration: 0.7,
        stagger: 0.07,
        ease: "power2.out",
        delay: 0.08,
        overwrite: "auto",
      });
      gsap.to(ctaEl, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: "power2.out",
        delay: 0.24,
        overwrite: "auto",
      });
      /**
       * "auto" overwrites per PROPERTY, not per target, so taking x and
       * opacity here leaves the looping float on y alone — the image keeps
       * breathing while it slides in.
       */
      gsap.to(imgEl, {
        opacity: 1,
        x: 0,
        duration: 0.95,
        ease: "power3.out",
        delay: 0.06,
        overwrite: "auto",
      });
    };

    if (isTransition && !isFirstRenderRef.current) {
      const prevSlideEl = slideRefs.current[prevIndex];
      if (prevSlideEl) {
        const prevTextEls = prevSlideEl.querySelectorAll("[data-slide-text]");
        const prevImgEl = prevSlideEl.querySelector("[data-slide-image]");
        const prevCtaEl = prevSlideEl.querySelector("[data-slide-cta]");
        const prevTypeEl = prevSlideEl.querySelector("[data-slide-megatype]");

        // Text drops back the way it came up; the image continues left, so
        // the pair reads as one pass across the frame.
        gsap.to([prevTextEls, prevTypeEl, prevCtaEl], {
          opacity: 0,
          y: 18,
          duration: EXIT,
          ease: "power2.in",
          overwrite: "auto",
        });
        gsap.to(prevImgEl, {
          opacity: 0,
          x: -120,
          duration: EXIT,
          ease: "power2.in",
          overwrite: "auto",
        });
      }

      // Cut once the old slide has cleared, then play the new one in.
      cutCallRef.current = gsap.delayedCall(EXIT, () => {
        if (!trackRef.current) return;
        gsap.set(trackRef.current, { xPercent });
        playIn();
      });
    } else {
      gsap.set(trackRef.current, { xPercent });
      playIn();
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

    prevIndexRef.current = pos;
    isFirstRenderRef.current = false;

    return () => {
      cutCallRef.current?.kill();
      cutCallRef.current = null;
    };
  }, [pos, index, products.length, reducedMotion]);

  if (loading) {
    return (
      <div
        className="relative flex min-h-[380px] w-full overflow-hidden md:min-h-[460px]"
        style={{ background: GROUND }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-white/60" />
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div
        className="relative flex min-h-[380px] w-full overflow-hidden md:min-h-[460px]"
        style={{ background: GROUND }}
      >
        <div className="relative flex flex-1 items-center justify-center p-8">
          <Image
            src="/featured.png"
            alt="Featured"
            width={400}
            height={200}
            className="object-contain opacity-70"
          />
        </div>
      </div>
    );
  }

  /**
   * The products as laid out on the track — just the real list.
   *
   * This used to carry a trailing copy of the first product so the wrap could
   * travel forwards across the track. Nothing travels any more, so the clone
   * was a wasted slide and a wasted image request.
   */
  const trackSlides = products;

  const ticker = [
    t("slider.tickerBrand"),
    t("slider.tickerShipping"),
    t("slider.tickerPayment"),
    t("slider.tickerExchange"),
  ];

  return (
    <section
      ref={sliderContainerRef}
      className="group/slider relative w-full overflow-hidden"
      style={{ perspective: "1000px" }}
      aria-roledescription="carousel"
      aria-label={t("slider.regionLabel")}
    >
      {/* The ticker is part of the frame, so the slides get the height above it. */}
      <div className="relative min-h-[380px] overflow-hidden pb-8 md:min-h-[460px]">
        <div className="absolute inset-0 z-0" style={{ background: GROUND }} aria-hidden />
        <div className="absolute inset-0 z-[1]" style={{ background: SHEEN }} aria-hidden />

        {/* Fine motes turning slowly through the lit volume, behind the part.
            Deliberately far below the component's defaults (400 particles at
            5px and 0.3 opacity): at those values it reads as falling snow over
            a shop, which is the same mistake the smoke pass made. At this
            density you do not consciously see particles — the hero just stops
            looking like a flat panel and starts looking like air with depth in
            it. `depth` is high rather than low precisely because the parallax
            between near and far motes is the part that does that work.
            The component pauses itself off-screen and when the tab is hidden,
            and paints one static frame under `prefers-reduced-motion`. */}
        {/* z-[2], under the ghost wordmark at z-[4] as well as the slides at
            z-10, so the field sits in the depth between the ground and the
            product rather than hovering in front of it.

            Dimmer and smaller than before for the same reason: DOM order
            already put these behind the part, but at 0.45 opacity and 2.2px
            they read as foreground sparkle competing with the product. Depth
            at 1 spreads the near and far particles furthest apart, which is
            what actually sells them as being *behind* something.

            drift is positive = upward (the component subtracts it from y) and
            goes from 0.22, which was almost static, to a rise you can see.
            Particles leaving the top respawn at the bottom, so the field reads
            as rising from below rather than drifting in place.

            The canvas is narrowed to the right 62% from md up, so the field
            sits behind the product rather than spread across the whole hero —
            it draws radially from the canvas centre, so shrinking the canvas
            is what re-centres the field on the part. Only from md: below that
            the layout stacks the image under the text and a right-biased
            field would sit nowhere near it.

            Note `depth` is clamped to 0–1 by the component, so values above 1
            behave exactly as 1. */}
        <Floating3DParticles
          className="z-[2] md:left-auto md:right-0 md:w-[62%]"
          quantity={360}
          color={PARTICLE_COLOR}
          size={3.5}
          opacity={0.36}
          drift={0.9}
          depth={1}
        />


        {/* Positioned and lifted deliberately: GSAP writes a transform here, which
            makes the track its own stacking context painted at z-index 0, and the
            ground and sheen above would otherwise cover the slides. */}
        <div
          ref={trackRef}
          className="relative z-10 flex"
          style={{ width: `${trackSlides.length * 100}%` }}
        >
          {trackSlides.map((product, i) => {
            const imgSrc = product.galleryImages?.[0] || product.images?.default || "/logo.svg";
            const slug = product.slug || productSlug(product.name) || String(product.id);
            const href = `/products/${slug}`;
            const priceStr =
              typeof product.price === "number"
                ? displayPrice(product.price)
                : formatPriceKr(product.price, locale);
            const shortDesc = product.shortDescription?.trim() || product.description?.slice(0, 120);
            const [line1, line2] = splitName(product.name);
            const imageCount = product.galleryImages?.length ?? 0;

            return (
              <div
                key={`${product.id}-${i}`}
                ref={(el) => { slideRefs.current[i] = el; }}
                className="flex flex-shrink-0"
                style={{ width: `${100 / trackSlides.length}%` }}
              >
                <Link
                  href={href}
                  className="flex min-h-[380px] w-full focus-visible:ring-2 focus-visible:ring-[rgb(110,201,0)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#16181b] md:min-h-[460px]"
                >
                  <div className="relative flex w-full flex-col md:flex-row">
                    {/* The name, oversized and hollow, running behind the part.
                        Outline only — a filled version at this size fights the
                        headline instead of sitting behind it. */}
                    <span
                      data-slide-megatype
                      aria-hidden
                      className="pointer-events-none absolute left-[-2%] top-1/2 z-[4] hidden -translate-y-1/2 whitespace-nowrap font-black italic uppercase leading-[0.8] tracking-[-0.045em] sm:block"
                      style={{
                        fontSize: "clamp(70px, 13vw, 168px)",
                        WebkitTextStroke: "1.5px rgba(255,255,255,0.14)",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      {line1}
                    </span>

                    {/* Left content */}
                    <div className="relative z-[12] flex flex-1 flex-col justify-center px-6 py-10 md:max-w-[52%] md:py-12 md:pl-10 md:pr-0 lg:pl-14">
                      <p
                        data-slide-text
                        className="mb-4 flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/40"
                      >
                        <span className="text-[rgb(110,201,0)]">
                          {pad((i % products.length) + 1)}
                        </span>
                        <span>/ {pad(products.length)}</span>
                        <span className="block h-px w-8 bg-current opacity-45" aria-hidden />
                        <span>
                          {imageCount > 1
                            ? t("slider.imageCount", { n: imageCount })
                            : t("slider.featured")}
                        </span>
                      </p>

                      <h2 data-slide-text className="flex flex-col gap-0.5">
                        <span className="text-3xl font-black uppercase italic leading-[0.96] tracking-tight text-white md:text-4xl lg:text-[46px]">
                          {line1}
                        </span>
                        {line2 && (
                          <span
                            className="text-2xl font-black uppercase italic leading-none tracking-tight md:text-3xl lg:text-[38px]"
                            style={{
                              WebkitTextStroke: "1.5px rgba(255,255,255,0.5)",
                              WebkitTextFillColor: "transparent",
                            }}
                          >
                            {line2}
                          </span>
                        )}
                      </h2>

                      {/* Clamped because the copy is admin-authored and runs
                          anywhere from one line to a paragraph; unclamped, a
                          long one pushes the CTA down and sits on top of the
                          oversized name behind it. */}
                      {shortDesc && (
                        <p
                          data-slide-text
                          className="mt-5 line-clamp-3 max-w-sm text-xs leading-relaxed text-white/60 md:mt-6 md:text-sm"
                        >
                          {shortDesc}
                        </p>
                      )}

                      <div data-slide-text className="mt-7 flex flex-wrap items-center gap-5 md:mt-8">
                        <span
                          data-slide-cta
                          className="group/btn relative isolate inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-md bg-white px-7 py-3 text-sm font-semibold uppercase tracking-wider text-[#16181b] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 active:translate-y-0 active:scale-[0.99] md:px-8 md:py-3.5"
                        >
                          {/* Shimmer sweep */}
                          <span className="pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-md" aria-hidden>
                            <span className="absolute inset-y-0 -left-1/3 w-1/2 -translate-x-full skew-x-[-18deg] bg-gradient-to-r from-transparent via-black/10 to-transparent transition-transform duration-700 ease-out group-hover/btn:translate-x-[320%]" />
                          </span>
                          <span className="relative z-[2]">{t("account.shopNow")}</span>
                          <ArrowRight
                            className="relative z-[2] h-4 w-4 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/btn:translate-x-1"
                            strokeWidth={2.5}
                            aria-hidden
                          />
                        </span>
                        <span className="text-xl font-bold tabular-nums tracking-tight text-white md:text-2xl">
                          {priceStr}
                        </span>
                      </div>
                    </div>

                    {/* Right image */}
                    <div
                      className="relative z-10 flex min-h-[240px] flex-1 items-center justify-center px-4 pb-8 pt-0 md:min-h-0 md:py-6 md:pl-0 md:pr-12"
                      style={{ perspective: "800px" }}
                    >
                      <div
                        data-slide-image
                        className="relative h-full w-full min-h-[230px] md:min-h-[380px]"
                        style={{ transformStyle: "preserve-3d" }}
                      >
                        {/* Contact shadow: the part is lit from above, so it has to
                            cast something onto the ground or it floats. */}
                        <span
                          aria-hidden
                          className="absolute bottom-[12%] left-1/2 z-[1] h-6 w-[54%] -translate-x-1/2 rounded-[50%]"
                          style={{
                            background: "radial-gradient(ellipse, rgba(0,0,0,0.6) 0%, transparent 72%)",
                            filter: "blur(9px)",
                          }}
                        />
                        <ImageWithFallback
                          src={imgSrc}
                          alt=""
                          fill
                          priority={i === 0}
                          fetchPriority={i === 0 ? "high" : "low"}
                          className="relative z-10 object-contain object-center transition-transform duration-700 ease-out group-hover/slider:scale-[1.04]"
                          style={{
                            filter: "drop-shadow(0 28px 36px rgba(0,0,0,0.68))",
                          }}
                          sizes={SHOT_SIZES}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>

        {products.length > 1 && (
          <>
            {/* Arrow navigation - bottom right, appears on hover */}
            <div className="absolute bottom-6 right-16 z-40 flex items-center gap-2 opacity-0 transition-opacity duration-300 group-hover/slider:opacity-100 md:right-20">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  goPrev();
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/[0.07] text-white/80 backdrop-blur-sm transition-all duration-200 hover:border-[rgb(110,201,0)] hover:bg-[rgb(110,201,0)] hover:text-[#10230a] active:scale-95"
                aria-label={t("slider.prevSlide")}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  goNext();
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/[0.07] text-white/80 backdrop-blur-sm transition-all duration-200 hover:border-[rgb(110,201,0)] hover:bg-[rgb(110,201,0)] hover:text-[#10230a] active:scale-95"
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
                    <div className="h-3 w-px bg-gradient-to-b from-white/10 to-white/20" aria-hidden />
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
                      className="font-mono text-[11px] tabular-nums transition-all duration-300"
                      style={{
                        color: i === index ? "rgb(110, 201, 0)" : "rgba(255,255,255,0.32)",
                      }}
                    >
                      {pad(i + 1)}
                    </span>
                    <span
                      data-dot-track
                      className="relative block w-[3px] overflow-hidden rounded-full bg-white/20"
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
      </div>

      {/* Ticker. Every claim here is one the TrustBar directly below already
          makes, so the two can't drift apart. The list is rendered twice and
          translated by exactly -50%, which is what makes the loop seamless. */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex h-8 items-center overflow-hidden bg-[rgb(110,201,0)]">
        <div className="homepage-slider-ticker flex gap-10 whitespace-nowrap pl-10 font-mono text-[10.5px] font-medium uppercase tracking-[0.24em] text-[#10230a]">
          {[...ticker, ...ticker].map((item, i) => (
            <span key={i} aria-hidden={i >= ticker.length}>
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
