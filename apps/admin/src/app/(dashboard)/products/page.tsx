"use client";

import Link from "next/link";
import { Product, createColumns } from "./columns";
import { DataTable } from "./data-table";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@repo/ui/components/button";
import { Plus, RefreshCw } from "lucide-react";
import { PRODUCT_API } from "@/lib/product-api";

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
      const products = await productsRes.json();
      setData(products);
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
    () => createColumns(handleDelete, categories),
    [handleDelete, categories]
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
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
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
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable columns={columns} data={data} categories={categories.map((c) => ({ id: c.id, name: c.parentName ? `${c.parentName} › ${c.name}` : c.name }))} onDelete={handleDelete} />
      )}
    </div>
  );
};

export default ProductsPage;
