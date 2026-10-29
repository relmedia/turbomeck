"use client";

import Link from "next/link";
import { Product, createColumns } from "./columns";
import { DataTable } from "./data-table";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@repo/ui/components/button";
import { Plus, RefreshCw } from "lucide-react";
import { PRODUCT_API } from "@/lib/product-api";
import { DashboardDataTableSkeleton } from "@/components/dashboard-skeletons";
import { scoreSeo } from "@/lib/seo-score";

/**
 * Attach an SEO score to every product.
 *
 * The same scorer the product form uses, so the number in the table and the
 * number on the page agree. It is given the rest of the catalogue so a
 * duplicate name or meta description is actually caught — that only shows up
 * when products are compared against each other, which is exactly what a
 * list can do and a single form cannot.
 */
function withSeoScores(products: Product[]): Product[] {
  return products.map((p, i) => {
    const others = products
      .filter((_, j) => j !== i)
      .map((o) => ({ name: o.name, shortDescription: o.shortDescription }));
    const result = scoreSeo({
      name: p.name ?? "",
      shortDescription: p.shortDescription ?? "",
      nameEn: p.nameEn ?? "",
      shortDescriptionEn: p.shortDescriptionEn ?? "",
      others,
    });
    return { ...p, seoScore: result.score, seoFindings: result.findings };
  });
}

const ProductsPage = () => {
  const [data, setData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<
    { id: number; name: string; parentId?: number | null; parentName?: string | null }[]
  >([]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        fetch(`${PRODUCT_API}/products`),
        fetch(`${PRODUCT_API}/categories`),
      ]);
      if (!productsRes.ok) throw new Error("Failed to fetch products");
      const products: Product[] = await productsRes.json();

      /**
       * Scored here, once, rather than inside the cell renderer.
       *
       * Two reasons. Duplicate detection needs every OTHER product, which a
       * cell does not have; and attaching the number to the row is what lets
       * the column sort by it, so "show me the worst listings" is one click
       * on the header.
       */
      setData(withSeoScores(products));
      if (categoriesRes.ok) {
        const cats = await categoriesRes.json();
        setCategories(cats);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Error fetching products:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  /**
   * Reflect a publish toggle in the table without refetching.
   *
   * The row is the only thing that changed, and a full reload would also
   * recompute every SEO score and lose the scroll position for what is a
   * one-field edit.
   */
  const handlePublishedChange = useCallback((id: number, published: boolean) => {
    setData((prev) =>
      prev.map((p) => (Number(p.id) === id ? { ...p, published } : p)),
    );
  }, []);

  const handleDelete = useCallback(async (ids: number[]) => {
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`${PRODUCT_API}/products/${id}`, {
            method: "DELETE",
          })
        )
      );
      await fetchProducts();
    } catch (err) {
      console.error("Error deleting products:", err);
    }
  }, [fetchProducts]);

  const columns = useMemo(
    () => createColumns(handleDelete, categories, handlePublishedChange),
    [handleDelete, categories, handlePublishedChange]
  );

  return (
    <div className="">
      <div className="mb-8 px-4 py-2 bg-secondary rounded-md flex items-center justify-between">
        <h1 className="font-semibold">Alla Produkter</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchProducts}
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button size="sm" asChild>
            <Link href="/products/add">
              <Plus className="mr-1 h-4 w-4" />
              Lägg till produkt
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
          {error}
          <Button
            variant="link"
            className="ml-2 text-red-700"
            onClick={fetchProducts}
          >
            Försök igen
          </Button>
        </div>
      )}

      {loading ? (
        <DashboardDataTableSkeleton filterChips={5} columns={8} rows={8} />
      ) : (
        <DataTable columns={columns} data={data} categories={categories.map((c) => ({ id: c.id, name: c.parentName ? `${c.parentName} › ${c.name}` : c.name }))} onDelete={handleDelete} />
      )}
    </div>
  );
};

export default ProductsPage;
