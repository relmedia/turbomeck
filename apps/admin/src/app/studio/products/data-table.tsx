"use client";

import {
  ColumnDef,
  FilterFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DataTablePagination } from "@/components/TablePagination";
import { useMemo, useState } from "react";
import { PanelLeftClose, Plus, Trash2 } from "lucide-react";

const productGlobalFilterFn: FilterFn<unknown> = (row, _columnId, filterValue) => {
  const val = String(filterValue ?? "").toLowerCase();
  if (!val) return true;
  const obj = row.original as Record<string, unknown>;
  const searchable = [
    obj.name,
    obj.shortDescription,
    obj.description,
    obj.sku,
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  return searchable.some((s) => s.includes(val));
};

interface DataTableProps<TData extends { id: number | string }, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  categories?: { id: number; name: string }[];
  onDelete?: (ids: number[]) => Promise<void>;
}

export function DataTable<TData extends { id: number | string }, TValue>({
  columns,
  data,
  categories = [],
  onDelete,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [statusFilters, setStatusFilters] = useState({ aktiv: true, slutsald: true, stangd: true });
  const [categoryFilters, setCategoryFilters] = useState<Record<number, boolean>>({});
  const [priceFilters, setPriceFilters] = useState({ range0_500: true, range500_1000: true, range1000: true });

  const filteredData = useMemo(() => {
    // Only apply status filter when user has unchecked at least one
    const hasStatusFilter =
      (statusFilters.aktiv || statusFilters.slutsald) &&
      !(statusFilters.aktiv && statusFilters.slutsald);
    const selectedCategoryIds = categories
      .filter((c) => categoryFilters[c.id] !== false)
      .map((c) => Number(c.id));
    // Only apply category filter when user has unchecked at least one category
    const hasCategoryFilter =
      selectedCategoryIds.length > 0 && selectedCategoryIds.length < categories.length;
    // Only apply price filter when user has unchecked at least one range
    const checkedPriceCount = [
      priceFilters.range0_500,
      priceFilters.range500_1000,
      priceFilters.range1000,
    ].filter(Boolean).length;
    const hasPriceFilter = checkedPriceCount > 0 && checkedPriceCount < 3;

    return data.filter((row) => {
      const obj = row as { stock?: number; categoryIds?: (number | string)[]; price?: number };
      const stock = obj.stock ?? 0;

      // Status: Aktiv = stock > 0, Slutsåld = stock <= 0
      if (hasStatusFilter) {
        const statusMatch =
          (statusFilters.aktiv && stock > 0) ||
          (statusFilters.slutsald && stock <= 0);
        if (!statusMatch) return false;
      }

      // Category: include if row has at least one category in selected set
      if (hasCategoryFilter) {
        const rowIds = (obj.categoryIds ?? []).map((id) => Number(id));
        if (!rowIds.some((id) => selectedCategoryIds.includes(id))) return false;
      }

      // Price: include if in any selected range
      if (hasPriceFilter) {
        const price = Number(obj.price) ?? 0;
        const priceMatch =
          (priceFilters.range0_500 && price >= 0 && price < 500) ||
          (priceFilters.range500_1000 && price >= 500 && price < 1000) ||
          (priceFilters.range1000 && price >= 1000);
        if (!priceMatch) return false;
      }

      return true;
    });
  }, [data, statusFilters, categoryFilters, priceFilters, categories]);

  const table = useReactTable<TData>({
    data: filteredData,
    columns: columns as ColumnDef<TData, unknown>[],
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      rowSelection,
      columnVisibility,
      globalFilter,
    },
    globalFilterFn: productGlobalFilterFn as FilterFn<TData>,
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedCount = selectedRows.length;
  const selectedIds = selectedRows.map((row) => Number((row.original as { id: number | string }).id));

  const handleBulkDelete = async () => {
    if (!onDelete || selectedIds.length === 0) return;
    setIsBulkDeleting(true);
    try {
      await onDelete(selectedIds);
      setShowBulkDeleteConfirm(false);
      setRowSelection({});
    } catch (err) {
      console.error("Error deleting products:", err);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
          <Input
            placeholder="Sök produkter..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="max-w-sm"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              <DropdownMenuCheckboxItem
                checked={statusFilters.aktiv}
                onCheckedChange={(v) => setStatusFilters((s) => ({ ...s, aktiv: !!v }))}
                onSelect={(e) => e.preventDefault()}
              >
                Aktiv
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={statusFilters.slutsald}
                onCheckedChange={(v) => setStatusFilters((s) => ({ ...s, slutsald: !!v }))}
                onSelect={(e) => e.preventDefault()}
              >
                Slutsåld
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={statusFilters.stangd}
                onCheckedChange={(v) => setStatusFilters((s) => ({ ...s, stangd: !!v }))}
                onSelect={(e) => e.preventDefault()}
              >
                Stängd för försäljning
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Kategori
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {categories.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={categoryFilters[c.id] ?? true}
                  onCheckedChange={(v) => setCategoryFilters((s) => ({ ...s, [c.id]: !!v }))}
                  onSelect={(e) => e.preventDefault()}
                >
                  {c.name}
                </DropdownMenuCheckboxItem>
              ))}
              {categories.length === 0 && (
                <DropdownMenuCheckboxItem disabled>Inga kategorier</DropdownMenuCheckboxItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Pris
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              <DropdownMenuCheckboxItem
                checked={priceFilters.range0_500}
                onCheckedChange={(v) => setPriceFilters((s) => ({ ...s, range0_500: !!v }))}
                onSelect={(e) => e.preventDefault()}
              >
                0 - 500 kr
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={priceFilters.range500_1000}
                onCheckedChange={(v) => setPriceFilters((s) => ({ ...s, range500_1000: !!v }))}
                onSelect={(e) => e.preventDefault()}
              >
                500 - 1000 kr
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={priceFilters.range1000}
                onCheckedChange={(v) => setPriceFilters((s) => ({ ...s, range1000: !!v }))}
                onSelect={(e) => e.preventDefault()}
              >
                1000+ kr
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && onDelete && (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBulkDeleteConfirm(true)}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Ta bort ({selectedCount})
              </Button>
              <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Är du säker?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Du håller på att ta bort {selectedCount} produkt{selectedCount !== 1 ? "er" : ""}.
                      Denna åtgärd kan inte ångras.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isBulkDeleting}>Avbryt</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleBulkDelete}
                      disabled={isBulkDeleting}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      {isBulkDeleting ? "Raderar..." : "Ta bort"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <PanelLeftClose className="w-4 h-4 mr-1" />
              Kolumner
            </Button>
          </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {table
                .getAllColumns()
                .filter((col) => col.getCanHide())
                .map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={col.getIsVisible()}
                    onCheckedChange={(value) => col.toggleVisibility(!!value)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {({ select: "Markering", product: "Produkt namn", price: "Pris", categoryIds: "Kategori", stock: "Lager", sku: "SKU", rating: "Betyg", status: "Status", actions: "Åtgärder" } as Record<string, string>)[col.id] ?? col.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>
      <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                Inga produkter hittades.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <DataTablePagination table={table} />
      </div>
    </div>
  );
}
