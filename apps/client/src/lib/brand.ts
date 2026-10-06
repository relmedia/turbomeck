/**
 * The two colours the logo is made of, in one place.
 *
 * The wordmark is green "TURBO" + charcoal "MECK" (see `Navbar.tsx`), and until
 * now those values were retyped per component — `rgb(110, 201, 0)` in the hero,
 * `#6ec900` in the login pages, `#333333` in the mobile menu, `gray-700` in the
 * navbar. Anything that wants to look like Turbomeck should import from here.
 *
 * Kept as plain strings rather than Tailwind classes because several call sites
 * need them in inline styles (gradients, tinted backgrounds, SVG strokes),
 * where arbitrary-value classes can't interpolate.
 */
export const BRAND = {
  /** Logo green. */
  green: "rgb(110, 201, 0)",
  greenHex: "#6ec900",
  /** Slightly deeper green for text/icons that need contrast on white. */
  greenInk: "#4f9400",
  /** 10% green, for tinted surfaces. */
  greenTint: "rgba(110, 201, 0, 0.10)",

  /** Logo charcoal — the "MECK" half. */
  ink: "#2f2f2f",
  /** Darker end for charcoal gradients. */
  inkDeep: "#1c1c1c",
} as const;

/** Charcoal panel used by the landing-page cards. */
export const INK_GRADIENT = `linear-gradient(135deg, ${BRAND.inkDeep} 0%, ${BRAND.ink} 55%, #3a3a3a 100%)`;
