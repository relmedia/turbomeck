import type { MetadataRoute } from "next";
import { fetchProducts, fetchCategories } from "@/lib/api";
import { absoluteUrl } from "@/lib/site";
import { productUrl, categorySlug } from "@/lib/utils";

/**
 * Served at /sitemap.xml.
 *
 * Swedish is the only indexable locale, so every URL here is emitted once, in
 * its canonical (Swedish-slug) form — see productUrl. No hreflang alternates.
 *
 * Revalidated hourly rather than per request: a crawler hitting this would
 * otherwise force a full catalogue read, and new products do not need to
 * appear within the minute.
 */
export const revalidate = 3600;

/** Static routes worth indexing. Account/cart/auth are excluded in robots.ts. */
const STATIC_PATHS: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1.0, changeFrequency: "daily" },
  { path: "/products", priority: 0.9, changeFrequency: "daily" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((s) => ({
    url: absoluteUrl(s.path),
    lastModified: now,
    changeFrequency: s.changeFrequency,
    priority: s.priority,
  }));

  // Settled independently: a catalogue outage should still produce a valid
  // sitemap with the static routes rather than a 500, which Search Console
  // reports as "couldn't fetch" and then retries far less often.
  const [products, categories] = await Promise.allSettled([
    fetchProducts("sv"),
    fetchCategories("sv"),
  ]);

  if (products.status === "fulfilled") {
    for (const p of products.value) {
      entries.push({
        url: absoluteUrl(productUrl(p)),
        lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  } else {
    console.error("sitemap: product fetch failed:", products.reason);
  }

  // Categories are filter state on /products, not routes of their own, so they
  // are listed in the form the UI actually links to. Deduped because
  // categorySlug() joins parent+name and two rows can collapse to one slug.
  if (categories.status === "fulfilled") {
    const seen = new Set<string>();
    for (const c of categories.value) {
      const slug = categorySlug(c);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      entries.push({
        url: absoluteUrl(`/products?category=${slug}`),
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  } else {
    console.error("sitemap: category fetch failed:", categories.reason);
  }

  return entries;
}
