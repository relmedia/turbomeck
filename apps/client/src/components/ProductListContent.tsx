"use client";

import { ProductType } from "@/types";
import ProductCard from "./ProductCard";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "./ui/pagination";
import { useTranslation } from "@/i18n/context";

type Props = {
  products: ProductType[];
  hasSearch: boolean;
  /** True when the product API request failed (network or 5xx), not an empty catalog */
  loadFailed?: boolean;
  currentPage: number;
  totalPages: number;
  showViewAllLink: boolean;
};

function buildPath(
  pathname: string,
  searchParams: URLSearchParams,
  page: number
): string {
  const sp = new URLSearchParams(searchParams);
  sp.set("page", String(page));
  return `${pathname}?${sp.toString()}`;
}

export function ProductListContent({
  products,
  hasSearch,
  loadFailed = false,
  currentPage,
  totalPages,
  showViewAllLink,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslation();

  const path = (p: number) => buildPath(pathname, searchParams, p);

  return (
    <>
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-8 md:grid-cols-3 lg:grid-cols-4">
        {products.length > 0 ? (
          products.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              priority={i < 4}
            />
          ))
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center py-16 px-4 rounded-xl border border-dashed border-border bg-muted/20">
            <p className="text-base font-medium text-foreground">
              {loadFailed
                ? t("products.loadFailed")
                : hasSearch
                  ? t("products.noProductsMatch")
                  : t("products.noProducts")}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-lg text-center">
              {loadFailed
                ? t("products.loadFailedHint")
                : hasSearch
                  ? t("products.tryDifferentSearch")
                  : t("products.browseCategories")}
            </p>
          </div>
        )}
      </div>
      {showViewAllLink && (
        <Link
          href="/products"
          className="flex justify-end mt-4 underline text-sm text-gray-500"
        >
          {t("products.viewAllProducts")}
        </Link>
      )}
      {totalPages > 1 && (
        <Pagination className="mt-8">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={currentPage > 1 ? path(currentPage - 1) : "#"}
                aria-disabled={currentPage <= 1}
                className={
                  currentPage <= 1 ? "pointer-events-none opacity-50" : ""
                }
              />
            </PaginationItem>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
              if (
                p === 1 ||
                p === totalPages ||
                (p >= currentPage - 2 && p <= currentPage + 2)
              ) {
                return (
                  <PaginationItem key={p}>
                    <PaginationLink href={path(p)} isActive={p === currentPage}>
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                );
              }
              if (p === currentPage - 3 || p === currentPage + 3) {
                return (
                  <PaginationItem key={p}>
                    <PaginationEllipsis />
                  </PaginationItem>
                );
              }
              return null;
            })}
            <PaginationItem>
              <PaginationNext
                href={
                  currentPage < totalPages ? path(currentPage + 1) : "#"
                }
                aria-disabled={currentPage >= totalPages}
                className={
                  currentPage >= totalPages
                    ? "pointer-events-none opacity-50"
                    : ""
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </>
  );
}
