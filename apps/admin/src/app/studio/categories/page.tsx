"use client";

import { Category, createColumns } from "./columns";
import { DataTable } from "./data-table";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw } from "lucide-react";
import AddCategory from "@/components/AddCategory";
import EditCategory from "@/components/EditCategory";
import { PRODUCT_API } from "@/lib/product-api";

const CategoriesPage = () => {
  const [data, setData] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${PRODUCT_API}/categories`);
      if (!res.ok) throw new Error("Failed to fetch categories");
      const categories = await res.json();
      setData(categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Error fetching categories:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        const res = await fetch(`${PRODUCT_API}/categories/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete");
        await fetchCategories();
      } catch (err) {
        console.error("Error deleting category:", err);
        throw err;
      }
    },
    [fetchCategories]
  );

  const handleDeleteSelected = useCallback(
    async (selected: Category[]) => {
      for (const cat of selected) {
        await handleDelete(cat.id);
      }
    },
    [handleDelete]
  );

  const handleEdit = useCallback((category: Category) => {
    setEditingCategory(category);
    setEditSheetOpen(true);
  }, []);

  const handleEditSuccess = useCallback(() => {
    fetchCategories();
  }, [fetchCategories]);

  const columns = useMemo(
    () => createColumns(handleDelete, handleEdit),
    [handleDelete, handleEdit]
  );

  return (
    <div className="">
      <div className="mb-8 px-4 py-2 bg-secondary rounded-md flex items-center justify-between">
        <div>
          <h1 className="font-semibold">Alla Kategorier</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Organisera produkter i kategorier för enklare navigering
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchCategories}
            disabled={loading}
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
          <Sheet open={addSheetOpen} onOpenChange={setAddSheetOpen}>
            <SheetTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Lägg till kategori
              </Button>
            </SheetTrigger>
            <AddCategory
              onSuccess={() => {
                setAddSheetOpen(false);
                fetchCategories();
              }}
            />
          </Sheet>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
          {error}
          <Button
            variant="link"
            className="ml-2 text-red-700"
            onClick={fetchCategories}
          >
            Försök igen
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center h-64 items-center">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data}
            onDeleteSelected={handleDeleteSelected}
          />

          {editingCategory && (
            <Sheet
              open={editSheetOpen}
              onOpenChange={(open) => {
                setEditSheetOpen(open);
                if (!open) setEditingCategory(null);
              }}
            >
              <EditCategory
                category={editingCategory}
                categories={data}
                onSuccess={handleEditSuccess}
                onClose={() => {
                  setEditSheetOpen(false);
                  setEditingCategory(null);
                }}
              />
            </Sheet>
          )}
        </>
      )}
    </div>
  );
};

export default CategoriesPage;
