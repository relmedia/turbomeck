"use client";

import { useEffect, useState } from "react";
import { ProductType } from "@/types";
import { useLanguage } from "@/i18n/context";
import Categories from "./Categories";
import { ProductsToolbar } from "./ProductsToolbar";
import { ProductListContent } from "./ProductListContent";
import { ProductCardSkeleton } from "./ProductCardSkeleton";
import { fetchProducts, fetchCategories } from "@/lib/api";
import { getCategoryIdsForFilter } from "@/lib/utils";

const PAGE_SIZE = 8;

function matchesSearch(p: ProductType, q: string): boolean {
  const lower = q.toLowerCase().trim();
  if (!lower) return true;
  const fields = [p.name, p.shortDescription, p.description].filter(Boolean);
  return fields.some((f) => String(f).toLowerCase().includes(lower));
}

type SortOption = "newest" | "oldest" | "asc" | "desc";

function sortProducts(products: ProductType[], sort: SortOption): ProductType[] {
  const sorted = [...products];
  const idNum = (p: ProductType) => Number(p.id) || 0;
  switch (sort) {
    case "newest":
      return sorted.sort((a, b) => idNum(b) - idNum(a));
    case "oldest":
      return sorted.sort((a, b) => idNum(a) - idNum(b));
    case "asc":
      return sorted.sort((a, b) => a.price - b.price);
    case "desc":
      return sorted.sort((a, b) => b.price - a.price);
    default:
      return sorted;
  }
}

type CategoryItem = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

type Props = {
  categories: CategoryItem[];
  category?: string;
  params: "homepage" | "products";
  page?: string;
  search?: string;
  sort?: string;
};

export function ProductListClient({
  categories,
  category,
  params,
  page: pageParam,
  search: searchParam,
  sort: sortParam,
}: Props) {
  const { locale } = useLanguage();
  const [products, setProducts] = useState<ProductType[]>([]);
  const [categoriesState, setCategoriesState] = useState<CategoryItem[]>(categories);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([fetchProducts(locale), fetchCategories(locale)]).then(
      (results) => {
        if (cancelled) return;
        const [pRes, cRes] = results;
        // #region agent log
        if (process.env.NODE_ENV === "development") {
          fetch("/api/debug-log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: "e93869",
              hypothesisId: "H8",
              location: "ProductListClient.tsx:useEffect",
              message: "fetchProducts + fetchCategories settled",
              data: {
                locale,
                productsStatus: pRes.status,
                categoriesStatus: cRes.status,
                productsCount:
                  pRes.status === "fulfilled" ? pRes.value.length : null,
                productsReason:
                  pRes.status === "rejected"
                    ? String((pRes.reason as Error)?.message ?? pRes.reason)
                    : null,
                categoriesReason:
                  cRes.status === "rejected"
                    ? String((cRes.reason as Error)?.message ?? cRes.reason)
                    : null,
              },
            }),
          }).catch(() => {});
        }
        // #endregion
        if (pRes.status === "fulfilled") setProducts(pRes.value);
        else {
          console.error("Failed to fetch products:", pRes.reason);
          setProducts([]);
        }
        if (cRes.status === "fulfilled") setCategoriesState(cRes.value);
        else console.error("Failed to fetch categories:", cRes.reason);
      },
    ).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const selectedCategoryIds = getCategoryIdsForFilter(
    category ?? null,
    categoriesState,
  );
  let filteredProducts =
    selectedCategoryIds.length > 0
      ? products.filter(
          (p) =>
            (p.categoryIds?.length ?? 0) > 0 &&
            p.categoryIds!.some((id) => selectedCategoryIds.includes(id)),
        )
      : products;

  if (searchParam?.trim()) {
    filteredProducts = filteredProducts.filter((p) =>
      matchesSearch(p, searchParam),
    );
  }

  const sortOption: SortOption =
    sortParam === "oldest" || sortParam === "asc" || sortParam === "desc"
      ? sortParam
      : "newest";
  const sortedProducts = sortProducts(filteredProducts, sortOption);

  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const totalPages = Math.ceil(sortedProducts.length / PAGE_SIZE);
  const paginatedProducts = sortedProducts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const hasSearch = !!searchParam?.trim();

  if (loading) {
    return (
      <div className="w-full">
        <Categories categories={categoriesState} />
        {params === "products" && <ProductsToolbar />}
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-8 md:grid-cols-3 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Categories categories={categoriesState} />
      {params === "products" && <ProductsToolbar />}
      <ProductListContent
        products={paginatedProducts}
        hasSearch={hasSearch}
        loadFailed={loadFailed}
        currentPage={currentPage}
        totalPages={totalPages}
        showViewAllLink={sortedProducts.length > 0 && params === "products"}
      />
    </div>
  );
}
