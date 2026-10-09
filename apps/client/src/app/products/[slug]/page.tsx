/**
 * There is deliberately no `loading.tsx` in this segment.
 *
 * A segment-level `loading.tsx` wraps the route in a Suspense boundary, which
 * makes Next stream the shell before the page body has resolved — and the HTTP
 * status is sent with that first chunk. `notFound()` and `permanentRedirect()`
 * below can then only swap the *content*, leaving the response a 200: an
 * unknown slug becomes a soft 404, and the id form of a URL stays indexable
 * instead of redirecting. The page server-renders its content now, so there is
 * no skeleton phase on a cold load to cover anyway.
 *
 * (NOTE: the statuses are still 200 for an unrelated, pre-existing reason —
 * `notFound()` returns 200 everywhere in this app, including from a trivial
 * route with no middleware. That is tracked separately; removing this
 * boundary is a prerequisite for the fix, not the fix itself.)
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { ProductPageClient } from "@/components/ProductPageClient";
import { BreadcrumbJsonLd, ProductJsonLd } from "@/components/seo/JsonLd";
import { fetchProduct, fetchCategories } from "@/lib/api";
import { LOCALE_COOKIE_NAME, type Locale } from "@/i18n/context";
import { categorySlug } from "@/lib/utils";
import { htmlToText, truncateAtWord } from "@/lib/html-text";

async function readLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return (cookieStore.get(LOCALE_COOKIE_NAME)?.value as Locale) || "sv";
}

/**
 * `generateMetadata` and the page body both need the product. React's `cache`
 * dedupes them into a single request per render — previously the product was
 * fetched twice per view, and the metadata copy was fetched with no locale at
 * all, so an English visitor got a Swedish title over English content.
 */
const getProduct = cache(async (slug: string, locale: Locale) => {
  try {
    return await fetchProduct(slug, locale);
  } catch (e) {
    console.error(`Product page: fetch failed for "${slug}":`, e);
    return null;
  }
});

const getCategories = cache(async (locale: Locale) => {
  try {
    return await fetchCategories(locale);
  } catch (e) {
    console.error("Product page: category fetch failed:", e);
    return [];
  }
});

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> => {
  const { slug } = await params;
  const locale = await readLocale();
  const product = await getProduct(slug, locale);
  if (!product) return { title: "Produkt hittades inte", robots: { index: false, follow: true } };

  // Canonical always points at the Swedish-derived API slug, so the id form
  // and the English slug both consolidate onto one indexable URL.
  const canonicalPath = `/products/${product.slug || slug}`;
  // Tags stripped and cut at a word: the raw field is rich text, and a meta
  // description truncated mid-tag renders as visible markup in the SERP.
  const description = truncateAtWord(
    htmlToText(product.shortDescription) || htmlToText(product.description) || product.name,
    160,
  );
  const image = product.images?.default;

  return {
    // The root layout's template appends " | Turbomeck".
    title: product.name,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "website",
      locale: "sv_SE",
      url: canonicalPath,
      title: product.name,
      description,
      ...(image ? { images: [{ url: image, alt: product.name }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
};

const ProductPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ color?: string; size?: string }>;
}): Promise<React.ReactElement> => {
  const { slug } = await params;
  const { size, color } = await searchParams;
  const locale = await readLocale();

  const product = await getProduct(slug, locale);

  // Server-side, so a missing product is a real 404. This used to be called
  // from the client, which meant the response was HTTP 200 with a skeleton —
  // an indexable soft-404.
  if (!product) notFound();

  const categories = await getCategories(locale);

  // Canonicalise with a 308 rather than the client-side router.replace this
  // replaces: a crawler never ran that JS, so both the id URL and the English
  // slug stayed indexable as duplicates of this page.
  const canonicalSlug = product.slug;
  if (canonicalSlug && slug !== canonicalSlug) {
    const qs = new URLSearchParams();
    if (size) qs.set("size", size);
    if (color) qs.set("color", color);
    const query = qs.toString();
    permanentRedirect(`/products/${canonicalSlug}${query ? `?${query}` : ""}`);
  }

  const firstCategoryId = product.categoryIds?.[0];
  const firstCategory = firstCategoryId
    ? categories.find((c) => c.id === firstCategoryId) ?? null
    : null;

  return (
    <>
      <ProductJsonLd product={product} />
      <BreadcrumbJsonLd
        items={[
          { name: "Hem", path: "/" },
          { name: "Produkter", path: "/products" },
          // Same label and href the visible trail uses
          // (ProductDetailContent.tsx:111-126), so the markup describes the
          // breadcrumb the user actually sees — Google requires that match.
          ...(firstCategory
            ? [
                {
                  name: firstCategory.parentName
                    ? `${firstCategory.parentName} › ${firstCategory.name}`
                    : firstCategory.name,
                  path: `/products?category=${categorySlug(firstCategory)}`,
                },
              ]
            : []),
          { name: product.name, path: `/products/${canonicalSlug || slug}` },
        ]}
      />
      <ProductPageClient
        product={product}
        categories={categories}
        size={size}
        color={color}
      />
    </>
  );
};

export default ProductPage;
