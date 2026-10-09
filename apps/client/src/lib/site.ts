/**
 * Canonical origin for the storefront.
 *
 * Every absolute URL we hand to a crawler — `metadataBase`, canonical links,
 * sitemap entries, robots' sitemap pointer, JSON-LD `@id`s — resolves through
 * here, so there is exactly one place that decides what "the site" is.
 *
 * nginx already makes the apex authoritative: www 301s to it in a single hop
 * and the legacy .cloud hosts 301 here with the path preserved
 * (deploy/nginx-turbomeck.se.conf). Emitting anything else would contradict
 * the redirect chain and split ranking signals across hostnames.
 *
 * Overridable per environment (preview deploys, staging) but never trailing-
 * slashed: `new URL("/products", SITE_URL)` depends on that.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://turbomeck.se"
).replace(/\/+$/, "");

export const SITE_NAME = "Turbomeck";

/** Absolute URL for a site-relative path, for metadata and structured data. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
