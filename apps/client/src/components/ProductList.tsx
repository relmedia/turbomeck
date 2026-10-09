import { cookies } from "next/headers";
import { ProductListClient } from "./ProductListClient";
import { fetchCategories, fetchProducts } from "@/lib/api";
import { LOCALE_COOKIE_NAME } from "@/i18n/context";
import type { Locale } from "@/i18n/context";
import type { ProductType } from "@/types";

const ProductList = async ({
  category,
  params,
  page: pageParam,
  search: searchParam,
  sort: sortParam,
  minPrice,
  maxPrice,
  inStock,
  utbytes,
  initialProducts,
}: {
  category?: string;
  params: "homepage" | "products";
  page?: string;
  search?: string;
  sort?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: string;
  utbytes?: string;
  /**
   * Lets a caller that has already fetched the catalogue hand it over instead
   * of paying for a second request — the homepage fetches products anyway to
   * build its category card images.
   */
  initialProducts?: ProductType[];
}) => {
  let categoriesList: {
    id: number;
    name: string;
    parentId?: number | null;
    parentName?: string | null;
  /** "Root category" marks the catch-all container; see isContainerCategory. */
  description?: string | null;
  }[] = [];
  let products: ProductType[] = initialProducts ?? [];
  const cookieStore = await cookies();
  const locale = (cookieStore.get(LOCALE_COOKIE_NAME)?.value as Locale) || "sv";

  // Settled independently so one failing list still renders the other, and so
  // a catalogue outage degrades to the client-side fetch rather than a crash.
  const [cats, prods] = await Promise.allSettled([
    fetchCategories(locale),
    initialProducts ? Promise.resolve(initialProducts) : fetchProducts(locale),
  ]);
  if (cats.status === "fulfilled") categoriesList = cats.value;
  else console.error("Failed to fetch categories:", cats.reason);
  if (prods.status === "fulfilled") products = prods.value;
  else console.error("Failed to fetch products:", prods.reason);

  // Per-request seed for the startpage's random pick. Generated here, on the
  // server, so the server HTML and the hydrated client shuffle identically —
  // and re-rolled on every request, which is what makes the selection change
  // on refresh.
  const shuffleSeed = (Math.random() * 2 ** 32) >>> 0;

  return (
    <ProductListClient
      categories={categoriesList}
      initialProducts={products}
      shuffleSeed={shuffleSeed}
      category={category}
      params={params}
      page={pageParam}
      search={searchParam}
      sort={sortParam}
      minPrice={minPrice}
      maxPrice={maxPrice}
      inStock={inStock}
      utbytes={utbytes}
    />
  );
};

export default ProductList;
