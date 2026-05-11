import { cookies } from "next/headers";
import { ProductListClient } from "./ProductListClient";
import { fetchCategories } from "@/lib/api";
import { LOCALE_COOKIE_NAME } from "@/i18n/context";
import type { Locale } from "@/i18n/context";

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
}) => {
  let categoriesList: {
    id: number;
    name: string;
    parentId?: number | null;
    parentName?: string | null;
  }[] = [];
  try {
    const cookieStore = await cookies();
    const locale = (cookieStore.get(LOCALE_COOKIE_NAME)?.value as Locale) || "sv";
    categoriesList = await fetchCategories(locale);
  } catch (e) {
    console.error("Failed to fetch categories:", e);
  }

  return (
    <ProductListClient
      categories={categoriesList}
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
