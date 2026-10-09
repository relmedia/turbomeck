import { cookies } from "next/headers";
import ProductList from "@/components/ProductList";
import { HomepageSlider } from "@/components/HomepageSlider";
import { TrustBar } from "@/components/TrustBar";
import { CategoryBrowse } from "@/components/CategoryBrowse";
import { SectionHeading } from "@/components/SectionHeading";
import { fetchSliderProducts, fetchCategories, fetchProducts } from "@/lib/api";
import { buildCategoryImageMap } from "@/lib/category-images";
import { categorySlug } from "@/lib/utils";
import { LOCALE_COOKIE_NAME, type Locale } from "@/i18n/context";
import type { Metadata } from "next";

/**
 * The homepage previously inherited the root layout's metadata verbatim, which
 * meant / and /products shipped identical titles — a duplicate-title signal on
 * the two most valuable URLs on the site.
 */
export const metadata: Metadata = {
  title: {
    // Absolute: the homepage should not read "... | Turbomeck".
    absolute: "Turbomeck – Turbodelar och avgassystem till Saab och Volvo",
  },
  alternates: { canonical: "/" },
};

const Homepage = async ({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string; search?: string }>;
}) => {
  const { category, page, search } = await searchParams;
  const isStartPage = !category && !search;

  let sliderProducts = [] as Awaited<ReturnType<typeof fetchSliderProducts>>;
  let categories = [] as Awaited<ReturnType<typeof fetchCategories>>;
  // Reused for the product grid below, so the homepage fetches the catalogue
  // once rather than once for the category images and again for the grid.
  let products = [] as Awaited<ReturnType<typeof fetchProducts>>;
  let categoryImages: Awaited<ReturnType<typeof buildCategoryImageMap>> = {};
  if (isStartPage) {
    const cookieStore = await cookies();
    const locale = (cookieStore.get(LOCALE_COOKIE_NAME)?.value as Locale) || "sv";
    // Fetched in parallel and settled independently: a failing category list
    // must not cost us the hero (and vice versa) — each section just renders
    // empty, as it did before either existed.
    const [slider, cats, prods] = await Promise.allSettled([
      fetchSliderProducts(locale),
      fetchCategories(locale),
      fetchProducts(locale),
    ]);
    if (slider.status === "fulfilled") sliderProducts = slider.value;
    else console.error("Homepage slider SSR fetch failed:", slider.reason);
    if (cats.status === "fulfilled") categories = cats.value;
    else console.error("Homepage categories SSR fetch failed:", cats.reason);
    // Card backgrounds come from the catalogue; without it the cards simply
    // fall back to the charcoal panel.
    if (prods.status === "fulfilled") products = prods.value;
    if (cats.status === "fulfilled" && prods.status === "fulfilled") {
      categoryImages = buildCategoryImageMap(cats.value, prods.value, categorySlug);
    } else if (prods.status === "rejected") {
      console.error("Homepage products SSR fetch failed:", prods.reason);
    }
  }

  return (
    <div className="">
      {isStartPage && (
        <>
          {/* Visually hidden: the hero slider is the page's visual opening and
              the brand is in the navbar, so there is nowhere to put a display
              h1 without redesigning the hero. The document still needs exactly
              one top-level heading, and this is it. */}
          <h1 className="sr-only">
            Turbomeck – turbodelar och avgassystem till Saab och Volvo
          </h1>
          {/* Hero + reassurance strip share one frame: the strip is the hero's
              plinth, so the elevation and the bottom margin live out here. */}
          <div className="mt-4 mb-12 shadow-lg sm:mt-6">
            <HomepageSlider initialProducts={sliderProducts} />
            <TrustBar />
          </div>
          <CategoryBrowse categories={categories} images={categoryImages} />
          <SectionHeading
            eyebrow="landing.productsEyebrow"
            title="landing.productsTitle"
          />
        </>
      )}
      <ProductList
        category={category}
        params="homepage"
        page={page}
        search={search}
        initialProducts={isStartPage ? products : undefined}
      />
    </div>
  );
};

export default Homepage;
