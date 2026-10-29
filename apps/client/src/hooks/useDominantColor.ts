"use client";

/**
 * The colour of a product image, for tinting the lightbox behind it.
 *
 * ## Reading the pixels at all
 *
 * The images live on R2, which sends no CORS headers, so drawing the original
 * onto a canvas taints it and `getImageData` throws. But the storefront
 * already serves every product image through Next's optimiser at
 * `/_next/image?...`, which is SAME-ORIGIN — no CORS involved, canvas stays
 * clean. A 32px variant is about 1 kB and is usually already in cache from
 * the gallery, so this costs effectively nothing.
 *
 * 32 is not arbitrary: Next only serves widths from its configured list, and
 * 16 is rejected while 32 is allowed.
 *
 * ## Why the result is not the image's colour
 *
 * These are cut-outs — a part photographed and lifted onto transparency.
 * Measured on a real one: 381 opaque pixels against 643 transparent, and an
 * alpha-weighted mean of rgb(127,128,129). Dead neutral grey, because the
 * products are bare metal.
 *
 * Painting that exact colour behind the image would make the part disappear
 * into the background. So the hue and saturation are kept — that is what
 * makes the backdrop read as belonging to the image — and only the lightness
 * is replaced, with a value chosen to stay clear of the subject's own. A blue
 * part gives a deep blue room, a grey part a near-black one, and a very dark
 * part a mid-grey one.
 *
 * Transparent pixels are excluded rather than averaged in. Including them
 * would mix in whatever the encoder left in the fully transparent areas,
 * which is not a colour anybody can see.
 */

import { useEffect, useState } from "react";

/**
 * The backdrop moves AWAY from the subject rather than sitting at a fixed
 * darkness.
 *
 * A dark room suits most of this catalogue — bare metal reads around 40-50%
 * lightness and stands off it well. But measured across real products, one
 * came in at 18% (a blackened shaft): against an 11% backdrop that is a
 * difference of seven points, and the part vanishes. The same literal-match
 * trap as painting the backdrop the product's own colour, just from the other
 * side.
 *
 * So: dark room for anything mid or light, and a mid-grey room for genuinely
 * dark subjects, which is how you would photograph a black part anyway. The
 * worst separation either rule produces is about twenty points, at the
 * crossover.
 */
const DARK_BACKDROP = 0.10;
const LIGHT_BACKDROP = 0.52;
const DARK_SUBJECT_BELOW = 0.30;
/** Grey products should not become a colour cast; vivid ones keep some life. */
const MAX_SATURATION = 0.45;
/** Below this alpha a pixel is background, not subject. */
const ALPHA_FLOOR = 32;

const SAMPLE_WIDTH = 32;

function sampleUrl(src: string): string {
  /** Already same-origin: the optimiser handles it, and so would a direct load. */
  const encoded = encodeURIComponent(src);
  return `/_next/image?url=${encoded}&w=${SAMPLE_WIDTH}&q=75`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToCss(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

/**
 * Returns a CSS colour derived from the image, or null until it is known.
 *
 * Null rather than a guess: the caller keeps its existing backdrop until
 * there is a real answer, so a slow or failed sample looks like nothing
 * happened instead of a flash of the wrong colour.
 */
export function useDominantColor(src: string | null | undefined): string | null {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setColor(null);
      return;
    }

    let cancelled = false;
    const img = new Image();
    /**
     * Same-origin, so this is belt and braces — but it also means a future
     * move to a CORS-enabled host keeps working rather than silently
     * falling back.
     */
    img.crossOrigin = "anonymous";
    img.decoding = "async";

    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        const w = Math.max(1, Math.min(img.naturalWidth || SAMPLE_WIDTH, SAMPLE_WIDTH));
        const h = Math.max(1, Math.min(img.naturalHeight || SAMPLE_WIDTH, SAMPLE_WIDTH));
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);

        const { data } = ctx.getImageData(0, 0, w, h);
        let r = 0;
        let g = 0;
        let b = 0;
        let weight = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3] ?? 0;
          if (a < ALPHA_FLOOR) continue;
          r += (data[i] ?? 0) * a;
          g += (data[i + 1] ?? 0) * a;
          b += (data[i + 2] ?? 0) * a;
          weight += a;
        }
        /** A fully transparent image has no colour to speak of. */
        if (weight === 0) return;

        const [h0, s0, l0] = rgbToHsl(r / weight, g / weight, b / weight);
        const lightness = l0 < DARK_SUBJECT_BELOW ? LIGHT_BACKDROP : DARK_BACKDROP;
        if (!cancelled) {
          setColor(hslToCss(h0, Math.min(s0, MAX_SATURATION), lightness));
        }
      } catch {
        /**
         * A tainted canvas throws here. Swallowed deliberately: the lightbox
         * keeps its default backdrop, which is the behaviour this replaces.
         */
      }
    };

    img.onerror = () => {
      /* Same: no colour, caller keeps its default. */
    };

    img.src = sampleUrl(src);

    return () => {
      cancelled = true;
      /** Stop a long download the moment the image changes. */
      img.src = "";
    };
  }, [src]);

  return color;
}
