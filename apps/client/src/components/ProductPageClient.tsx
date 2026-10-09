"use client";

import { useState } from "react";
import { ProductDetailContent } from "@/components/ProductDetailContent";
import { ProductImageGallery } from "@/components/ProductImageGallery";
import {
  ProductInfoTabs,
  PRODUCT_TABS_SECTION_ID,
  type ProductTabId,
} from "@/components/ProductInfoTabs";
import { ProductReviewsProvider } from "@/components/ProductReviews";
import type { ProductType } from "@/types";

type Category = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

/**
 * Interactive shell for the product page.
 *
 * The product and category list are fetched by the Server Component in
 * `app/products/[slug]/page.tsx` and handed down as props. This component used
 * to fetch them itself in a `useEffect`, which meant the server HTML was a
 * skeleton: the h1, price, description and specs only existed after hydration,
 * so a crawler saw an empty page. Locale changes still work — `setLocale`
 * calls `router.refresh()` (i18n/context.tsx), which re-runs the server
 * component and sends down newly localized props.
 *
 * What stays client-side is genuinely interactive: tab selection, the gallery,
 * and the reviews provider.
 */
type Props = {
  product: ProductType;
  categories: Category[];
  size?: string;
  color?: string;
};

export function ProductPageClient({
  product,
  categories,
  size: sizeParam,
  color: colorParam,
}: Props) {
  const [activeTab, setActiveTab] = useState<ProductTabId>("description");

  /** "Read more" under the clamped description: open the description tab and jump to it. */
  const showFullDescription = () => {
    setActiveTab("description");
    document
      .getElementById(PRODUCT_TABS_SECTION_ID)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const selectedSize = sizeParam || product.sizes[0];
  const selectedColor = colorParam || product.colors[0];
  const firstCategoryId = product.categoryIds?.[0];
  const firstCategory = firstCategoryId
    ? categories.find((c) => c.id === firstCategoryId) ?? null
    : null;

  return (
    <ProductReviewsProvider productId={Number(product.id)}>
      <div className="flex flex-col gap-4 mt-6">
        <div className="flex flex-col gap-4 lg:flex-row md:gap-12 mt-4">
          <div className="w-full lg:w-5/12">
            <ProductImageGallery
              images={product.galleryImages ?? [product.images?.default || "/products/1g.png"]}
              alt={product.name}
              decorativeImages
            />
          </div>
          <ProductDetailContent
            product={product}
            selectedSize={selectedSize}
            selectedColor={selectedColor}
            firstCategory={firstCategory}
            onReadMore={showFullDescription}
          />
        </div>
        <ProductInfoTabs
          product={product}
          categories={categories}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>
    </ProductReviewsProvider>
  );
}
