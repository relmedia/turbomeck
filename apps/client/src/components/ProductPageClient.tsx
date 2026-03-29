"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useLanguage } from "@/i18n/context";
import { fetchProduct, fetchCategories } from "@/lib/api";
import { toSlug } from "@/lib/utils";
import { ProductDetailContent } from "@/components/ProductDetailContent";
import { ProductImageGallery } from "@/components/ProductImageGallery";
import { notFound } from "next/navigation";
import type { ProductType } from "@/types";

type Category = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

type Props = {
  slug: string;
  size?: string;
  color?: string;
};

export function ProductPageClient({ slug, size: sizeParam, color: colorParam }: Props) {
  const { locale } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [product, setProduct] = useState<ProductType | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchProduct(slug, locale),
      fetchCategories(locale),
    ])
      .then(([p, cats]) => {
        if (!cancelled) {
          setProduct(p);
          setCategories(cats);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("Failed to fetch product:", e);
          setProduct(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [slug, locale]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 mt-6">
        <div className="flex flex-col gap-4 lg:flex-row md:gap-12 mt-4">
          <div className="w-full lg:w-5/12 h-96 rounded-lg bg-muted/50 animate-pulse" />
          <div className="w-full lg:w-7/12 flex flex-col gap-4">
            <div className="h-6 w-3/4 bg-muted/50 animate-pulse rounded" />
            <div className="h-4 w-full bg-muted/50 animate-pulse rounded" />
            <div className="h-4 w-full bg-muted/50 animate-pulse rounded" />
            <div className="h-8 w-1/4 bg-muted/50 animate-pulse rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) notFound();

  // Redirect to translated slug when URL doesn't match (ID-based or wrong language)
  const targetSlug = (product.name ? toSlug(product.name) : null) ?? product.slug ?? null;
  const isNumericSlug = /^\d+$/.test(slug);
  const slugMismatch = targetSlug && slug !== targetSlug;
  if (slugMismatch) {
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (sizeParam) params.set("size", sizeParam);
    if (colorParam) params.set("color", colorParam);
    const qs = params.toString();
    router.replace(`/products/${targetSlug}${qs ? `?${qs}` : ""}`);
  }

  const selectedSize = sizeParam || product.sizes[0];
  const selectedColor = colorParam || product.colors[0];
  const firstCategoryId = product.categoryIds?.[0];
  const firstCategory = firstCategoryId
    ? categories.find((c) => c.id === firstCategoryId) ?? null
    : null;

  return (
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
        />
      </div>
    </div>
  );
}
