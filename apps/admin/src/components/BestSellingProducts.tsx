"use client";

import { useState, useMemo, useEffect, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
  type SortingState,
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FileSpreadsheet, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type ProductRow = {
  id: number;
  name: string;
  image: string | null;
  sold: number;
  sales: number;
};

const MOCK_PRODUCTS: ProductRow[] = [
  { id: 1, name: "Sports Shoes", image: null, sold: 316, sales: 10 },
  { id: 2, name: "Black T-Shirt", image: null, sold: 274, sales: 20 },
  { id: 3, name: "Jeans", image: null, sold: 195, sales: 15 },
  { id: 4, name: "Red Sneakers", image: null, sold: 402, sales: 40 },
  { id: 5, name: "Red Scarf", image: null, sold: 280, sales: 37 },
  { id: 6, name: "Kitchen Accessory", image: null, sold: 150, sales: 18 },
  { id: 7, name: "Bicycle", image: null, sold: 316, sales: 25 },
  { id: 8, name: "Sports Shoes", image: null, sold: 290, sales: 12 },
];

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
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

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
                <Image
                  src={p.image || "/products/1g.png"}
                  alt={p.name}
                  fill
                  className="object-cover"
                  sizes="40px"
                  unoptimized
                />
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
                <DropdownMenuItem asChild>
                  <Link href={`/studio/products/${product.id}`}>Visa produkt</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: MOCK_PRODUCTS,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel({ pageSize: 8 }),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    state: { globalFilter, sorting },
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
    <div className="flex gap-2">
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
  }, [hideTitle, onToolbarRender, globalFilter]);

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
      </div>
    </div>
  );
}
