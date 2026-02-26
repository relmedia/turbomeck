import { ProductType } from "@/types";
import Categories from "./Categories";
import ProductCard from "./ProductCard";
import Link from "next/link";
import Filter from "./Filter";
import { fetchProducts, fetchCategories } from "@/lib/api";
import { getCategoryIdsForFilter } from "@/lib/utils";

const ProductList = async ({
  category,
  params,
}: {
  category: string;
  params: "homepage" | "products";
}) => {
  let products: ProductType[] = [];
  let categoriesList: { id: number; name: string }[] = [];
  try {
    [products, categoriesList] = await Promise.all([
      fetchProducts(),
      fetchCategories(),
    ]);
  } catch {
    products = [];
    categoriesList = [];
  }

  const selectedCategoryIds = getCategoryIdsForFilter(category, categoriesList);
  const filteredProducts =
    selectedCategoryIds.length > 0
      ? products.filter(
          (p) =>
            (p.categoryIds?.length ?? 0) > 0 &&
            p.categoryIds!.some((id) => selectedCategoryIds.includes(id))
        )
      : products;

  return (
    <div className="w-full">
      <Categories categories={categoriesList} />
      {params === "products" && <Filter />}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-12">
        {filteredProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {filteredProducts.length > 0 && (
        <Link
          href="/products"
          className="flex justify-end mt-4 underline text-sm text-gray-500"
        >
          Visa alla produkter
        </Link>
      )}
    </div>
  );
};

export default ProductList;
