"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductType } from "@/types";
import { useLanguage, useTranslation } from "@/i18n/context";
import { ProductsToolbar } from "./ProductsToolbar";
import { ProductListContent } from "./ProductListContent";
import { ProductCardSkeleton } from "./ProductCardSkeleton";
import { fetchProducts, fetchCategories } from "@/lib/api";
import { getCategoryIdsForFilter } from "@/lib/utils";
import {
  FilterSidebar,
  MobileFilterSheet,
  ActiveFilterChips,
} from "./ProductFilters";

const HOMEPAGE_PAGE_SIZE = 8;
const PRODUCTS_PAGE_SIZE = 9;

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
  /** Active filter params — passed through from the page query string. */
  minPrice?: string;
  maxPrice?: string;
  inStock?: string;
  utbytes?: string;
};

export function ProductListClient({
  categories,
  category,
  params,
  page: pageParam,
  search: searchParam,
  sort: sortParam,
  minPrice: minPriceParam,
  maxPrice: maxPriceParam,
  inStock: inStockParam,
  utbytes: utbytesParam,
}: Props) {
  const { locale } = useLanguage();
  const t = useTranslation();
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

  // Filter bounds derived from the full product universe BEFORE applying the
  // current filter state, so the slider range doesn't collapse as filters
  // narrow results.
  const priceBounds = useMemo(() => {
    if (products.length === 0) return { min: 0, max: 10_000 };
    let min = Infinity;
    let max = -Infinity;
    for (const p of products) {
      if (p.price < min) min = p.price;
      if (p.price > max) max = p.price;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: 0, max: 10_000 };
    }
    return {
      min: Math.max(0, Math.floor(min)),
      max: Math.max(Math.ceil(max), Math.floor(min) + 1),
    };
  }, [products]);

  const minPriceNum =
    minPriceParam != null && minPriceParam !== ""
      ? Number(minPriceParam)
      : null;
  const maxPriceNum =
    maxPriceParam != null && maxPriceParam !== ""
      ? Number(maxPriceParam)
      : null;
  const inStockOnly = inStockParam === "1";
  const exchangeOnly = utbytesParam === "1";

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

  if (minPriceNum != null && Number.isFinite(minPriceNum)) {
    filteredProducts = filteredProducts.filter((p) => p.price >= minPriceNum);
  }
  if (maxPriceNum != null && Number.isFinite(maxPriceNum)) {
    filteredProducts = filteredProducts.filter((p) => p.price <= maxPriceNum);
  }
  if (inStockOnly) {
    filteredProducts = filteredProducts.filter((p) => (p.stock ?? 0) > 0);
  }
  if (exchangeOnly) {
    filteredProducts = filteredProducts.filter(
      (p) => p.isExchangeTurbo === true,
    );
  }

  const sortOption: SortOption =
    sortParam === "oldest" || sortParam === "asc" || sortParam === "desc"
      ? sortParam
      : "newest";
  const sortedProducts = sortProducts(filteredProducts, sortOption);

  const isProductsPage = params === "products";
  const pageSize = isProductsPage ? PRODUCTS_PAGE_SIZE : HOMEPAGE_PAGE_SIZE;

  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const totalPages = Math.ceil(sortedProducts.length / pageSize);
  const paginatedProducts = sortedProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const hasSearch = !!searchParam?.trim();

  // Homepage layout is unchanged — filters only apply to /products.
  if (!isProductsPage) {
    if (loading) {
      return (
        <div className="w-full">
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
        <ProductListContent
          products={paginatedProducts}
          hasSearch={hasSearch}
          loadFailed={loadFailed}
          currentPage={currentPage}
          totalPages={totalPages}
          showViewAllLink={sortedProducts.length > 0}
          showPagination={false}
        />
      </div>
    );
  }

  // /products layout: left rail (md+) + main column with toolbar + grid.
  return (
    <div className="w-full">
      <div className="flex flex-col md:flex-row gap-6">
        <div className="hidden md:block md:sticky md:top-20 md:self-start md:w-64 md:shrink-0">
          <FilterSidebar
            categories={categoriesState}
            priceBounds={priceBounds}
          />
        </div>
        <div className="flex-1 min-w-0">
          <ProductsToolbar
            resultCount={sortedProducts.length}
            mobileFilters={
              <div className="md:hidden">
                <MobileFilterSheet
                  categories={categoriesState}
                  priceBounds={priceBounds}
                />
              </div>
            }
          />
          <ActiveFilterChips
            categories={categoriesState}
            priceBounds={priceBounds}
          />
          {loading ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-8 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(9)].map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <ProductListContent
              products={paginatedProducts}
              hasSearch={hasSearch}
              loadFailed={loadFailed}
              currentPage={currentPage}
              totalPages={totalPages}
              showViewAllLink={false}
              withSidebar
            />
          )}
          {!loading && sortedProducts.length === 0 && (
            <p className="sr-only">{t("products.resultCount", { count: 0 })}</p>
          )}
        </div>
      </div>
    </div>
  );
}
