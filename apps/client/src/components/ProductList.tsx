import { ProductType } from "@/types";
import Categories from "./Categories";
import ProductCard from "./ProductCard";
import Link from "next/link";
import { ProductsToolbar } from "./ProductsToolbar";
import { fetchProducts, fetchCategories } from "@/lib/api";
import { getCategoryIdsForFilter } from "@/lib/utils";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "./ui/pagination";

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

const ProductList = async ({
  category,
  params,
  page: pageParam,
  search: searchParam,
  sort: sortParam,
}: {
  category?: string;
  params: "homepage" | "products";
  page?: string;
  search?: string;
  sort?: string;
}) => {
  let products: ProductType[] = [];
  let categoriesList: {
    id: number;
    name: string;
    parentId?: number | null;
    parentName?: string | null;
  }[] = [];
  try {
    products = await fetchProducts();
  } catch (e) {
    console.error("Failed to fetch products:", e);
  }
  try {
    categoriesList = await fetchCategories();
  } catch (e) {
    console.error("Failed to fetch categories:", e);
  }

  const selectedCategoryIds = getCategoryIdsForFilter(
    category ?? null,
    categoriesList,
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

  const basePath = params === "products" ? "/products" : "/";
  const path = (p: number) => {
    const sp = new URLSearchParams();
    if (category) sp.set("category", category);
    if (searchParam?.trim()) sp.set("search", searchParam);
    if (sortParam) sp.set("sort", sortParam);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };

  const hasSearch = !!searchParam?.trim();

  return (
    <div className="w-full">
      <Categories categories={categoriesList} />
      {params === "products" && <ProductsToolbar />}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
        {paginatedProducts.length > 0 ? (
          paginatedProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center py-16 px-4 rounded-xl border border-dashed border-border bg-muted/20">
            <p className="text-base font-medium text-foreground">
              {hasSearch ? "Inga produkter matchade din sökning" : "Inga produkter att visa"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasSearch ? "Prova ett annat sökord eller bläddra bland kategorierna" : "Bläddra bland kategorierna för att hitta produkter"}
            </p>
          </div>
        )}
      </div>
      {sortedProducts.length > 0 && params === "products" && (
        <Link
          href="/products"
          className="flex justify-end mt-4 underline text-sm text-gray-500"
        >
          Visa alla produkter
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
                href={currentPage < totalPages ? path(currentPage + 1) : "#"}
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
    </div>
  );
};

export default ProductList;
