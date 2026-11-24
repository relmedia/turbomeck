/**
 * Turning a stored product-image reference into something a mail client will
 * actually render.
 *
 * Split out of `email.ts` because two renderers now need it: the compiled
 * order confirmation there, and the `{{order_items}}` block in
 * `email-merge-tags.ts` that fills an admin-built design. Importing it from
 * `email.ts` would have pulled nodemailer and the settings table into the
 * merge-tag module, which is deliberately dependency-free so the token
 * catalogue can be read without standing up a mail transport.
 *
 * `resolveProductImageUrlForEmail` stays exported from `email.ts` as well —
 * that is the name every existing caller imports.
 */

/**
 * Mail clients need absolute https URLs. Relative paths use R2 public base from env.
 */
function toAbsoluteProductImageUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (t.startsWith("https://") || t.startsWith("http://")) return t;
  if (t.startsWith("//")) return `https:${t}`;
  const base = (process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!base) return null;
  const path = t.startsWith("/") ? t : `/${t}`;
  return `${base}${path}`;
}

function isLocalhostUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
}

/**
 * Many email clients do not render AVIF/WebP in <img>. Optionally route through product-service
 * JPEG proxy when EMAIL_IMAGE_PROXY_BASE_URL or PRODUCT_SERVICE_PUBLIC_URL is a public https URL.
 */
export function resolveProductImageUrlForEmail(raw: string | null | undefined): string | null {
  const absolute = toAbsoluteProductImageUrl(raw);
  if (!absolute) return null;
  const needsRasterFallback = /\.(avif|webp)(\?|#|$)/i.test(absolute);
  const proxyBase = (
    process.env.EMAIL_IMAGE_PROXY_BASE_URL ||
    process.env.PRODUCT_SERVICE_PUBLIC_URL ||
    ""
  ).replace(/\/$/, "");
  const proxyOk =
    !!proxyBase &&
    proxyBase.startsWith("https://") &&
    !isLocalhostUrl(proxyBase) &&
    !isLocalhostUrl(absolute);
  if (needsRasterFallback && proxyOk) {
    return `${proxyBase}/api/email/img?u=${encodeURIComponent(absolute)}`;
  }
  return absolute;
}
