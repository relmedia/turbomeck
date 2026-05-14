"use client";

import { useState, useMemo, useEffect, useCallback, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { Input } from "@repo/ui/components/input";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, RefreshCw } from "lucide-react";
import Image from "next/image";
import { resolveImageUrl } from "@/lib/image-utils";
import Link from "next/link";
import { FileSpreadsheet, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardBestSellingTableSkeleton } from "@/components/dashboard-skeletons";

type ProductRow = {
  id: number;
  name: string;
  image: string | null;
  sold: number;
  sales: number;
};

const globalFilterFn: FilterFn<ProductRow> = (row, _columnId, filterValue) => {
  const val = String(filterValue ?? "").toLowerCase();
  if (!val) return true;
  const obj = row.original;
  return (
    obj.name.toLowerCase().includes(val) ||
    String(obj.id).includes(val)
  );
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type BestSellingProductsProps = { hideTitle?: boolean; onToolbarRender?: (toolbar: ReactNode) => void };

export function BestSellingProducts({ hideTitle, onToolbarRender }: BestSellingProductsProps = {}) {
  const [data, setData] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 8,
  });

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/best-selling-products");
      const list = res.ok ? await res.json() : [];
      setData(list);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const columns = useMemo<ColumnDef<ProductRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-2 h-8"
            onClick={() => column.toggleSorting()}
          >
            Produkt
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                {p.image ? (
                  <Image
                    src={resolveImageUrl(p.image)}
                    alt={p.name}
                    fill
                    className="object-cover"
                    sizes="40px"
                    unoptimized
                  />
                ) : (
                  <div className="h-full w-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    —
                  </div>
                )}
              </div>
              <span className="font-normal">{p.name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "sold",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-2 h-8"
            onClick={() => column.toggleSorting()}
          >
            Såld
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const sold = row.original.sold;
          const formatted = new Intl.NumberFormat("sv-SE", {
            style: "currency",
            currency: "SEK",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(sold);
          return <div className="font-normal">{formatted}</div>;
        },
      },
      {
        accessorKey: "sales",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-2 h-8"
            onClick={() => column.toggleSorting()}
          >
            Försäljning
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-normal">{row.original.sales}</span>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const product = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Öppna meny</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {product.id > 0 && (
                  <DropdownMenuItem asChild>
                    <Link href={`/products/${product.id}`}>Visa produkt</Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    state: { globalFilter, sorting, pagination },
    globalFilterFn,
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const filteredRows = table.getFilteredRowModel().rows;
  const totalRows = filteredRows.length;
  const startRow = totalRows > 0 ? pageIndex * pageSize + 1 : 0;
  const endRow = Math.min((pageIndex + 1) * pageSize, totalRows);

  const exportToExcel = () => {
    const rows = table.getFilteredRowModel().rows.map((row) => row.original);
    const headers = ["Produkt", "Såld", "Försäljning"];
    const csvRows = [
      headers.join(";"),
      ...rows.map((r) => {
        const sold = new Intl.NumberFormat("sv-SE", {
          style: "currency",
          currency: "SEK",
          minimumFractionDigits: 2,
        }).format(r.sold);
        return [r.name, sold, r.sales].join(";");
      }),
    ];
    const csv = csvRows.join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `basta-salgande-produkter-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportToPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const { autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF();
    const rows = table.getFilteredRowModel().rows.map((row) => row.original);
    const headers = ["Produkt", "Såld", "Försäljning"];
    const body = rows.map((r) => {
      const sold = new Intl.NumberFormat("sv-SE", {
        style: "currency",
        currency: "SEK",
        minimumFractionDigits: 2,
      }).format(r.sold);
      return [r.name, sold, String(r.sales)];
    });
    doc.setFontSize(16);
    doc.text("Bäst säljande produkter", 14, 20);
    autoTable(doc, {
      startY: 28,
      head: [headers],
      body,
      styles: { fontSize: 9 },
      theme: "grid",
    });
    doc.save(`basta-salgande-produkter-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const toolbar = (
    <div className="flex gap-2 items-center">
      <Button
        variant="ghost"
        size="sm"
        onClick={fetchProducts}
        disabled={loading}
        aria-label="Uppdatera"
      >
            <RefreshCw className="w-4 h-4" />
      </Button>
      <Input
        placeholder="Filtrera produkter..."
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        className="max-w-[200px]"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Exportera
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={exportToExcel}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel (CSV)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportToPdf}>
            <FileText className="mr-2 h-4 w-4" />
            PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  useEffect(() => {
    if (hideTitle && onToolbarRender) onToolbarRender(toolbar);
  }, [hideTitle, onToolbarRender, globalFilter, loading]);

  return (
    <div className="space-y-4">
      {!(hideTitle && onToolbarRender) && (
        <div className={cn(
          "flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between",
          hideTitle && "flex-row gap-2"
        )}>
          {!hideTitle && <h1 className="text-lg font-semibold">Bäst säljande produkter</h1>}
          <div className={cn("flex gap-2", hideTitle && "ml-auto")}>
            {hideTitle && !onToolbarRender && toolbar}
            {!hideTitle && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Exportera
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportToExcel}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Excel (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToPdf}>
                    <FileText className="mr-2 h-4 w-4" />
                    PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}
      {!hideTitle && (
        <Input
          placeholder="Filtrera produkter..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-sm"
        />
      )}
      <div className="rounded-xl border bg-card overflow-hidden font-light [&_th]:font-normal">
        {loading && data.length === 0 ? (
          <DashboardBestSellingTableSkeleton />
        ) : (
        <>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Inga produkter att visa.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
          <span>
            Visar {startRow} till {endRow} av {totalRows} poster
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
