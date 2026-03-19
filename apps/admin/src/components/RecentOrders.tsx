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
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, MoreHorizontal } from "lucide-react";
import Link from "next/link";

export type OrderRow = {
  id: string;
  orderId: number;
  userId: string | null;
  fullName: string;
  productName: string;
  amount: number;
  status: "pending" | "processing" | "shipped" | "success" | "failed";
  productImage?: string | null;
};

const MOCK_ORDERS: OrderRow[] = [
  { id: "1", orderId: 1023, userId: "1", fullName: "Theodore Bell", productName: "Tire Doodad", amount: 300, status: "processing", productImage: null },
  { id: "2", orderId: 2045, userId: "2", fullName: "Amelia Grant", productName: "Engine Kit", amount: 450, status: "pending", productImage: null },
  { id: "3", orderId: 3012, userId: "3", fullName: "Eleanor Ward", productName: "Brake Pad", amount: 189, status: "success", productImage: null },
  { id: "4", orderId: 4018, userId: "4", fullName: "John Doe", productName: "Wireless Headphones", amount: 134, status: "pending", productImage: null },
  { id: "5", orderId: 5019, userId: "5", fullName: "Jane Doe", productName: "Bluetooth Speaker", amount: 124, status: "success", productImage: null },
  { id: "6", orderId: 6020, userId: "6", fullName: "Mike Galloway", productName: "Running Shoes", amount: 167, status: "failed", productImage: null },
  { id: "7", orderId: 7021, userId: "7", fullName: "Minerva Robinson", productName: "Leather Wallet", amount: 156, status: "processing", productImage: null },
  { id: "8", orderId: 8022, userId: "8", fullName: "Mable Clayton", productName: "Smart Watch", amount: 145, status: "success", productImage: null },
];

const statusConfig: Record<string, { label: string; className: string }> = {
  processing: { label: "Behandlas", className: "bg-blue-50 text-blue-700 border border-blue-200" },
  shipped: { label: "Skickad", className: "bg-sky-50 text-sky-700 border border-sky-200" },
  pending: { label: "Betald", className: "bg-amber-50 text-amber-700 border border-amber-200" },
  success: { label: "Slutförd", className: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  failed: { label: "Misslyckad", className: "bg-red-50 text-red-700 border border-red-200" },
};

const globalFilterFn: FilterFn<OrderRow> = (row, _columnId, filterValue) => {
  const val = String(filterValue ?? "").toLowerCase();
  if (!val) return true;
  const obj = row.original;
  const searchable = [
    obj.fullName,
    obj.productName,
    String(obj.orderId),
    obj.id,
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  return searchable.some((s) => s.includes(val));
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type RecentOrdersProps = {
  hideTitle?: boolean;
  onToolbarRender?: (toolbar: ReactNode) => void;
  orders?: OrderRow[];
  firstUserId?: string | null;
};

export function RecentOrders({ hideTitle, onToolbarRender, orders: ordersProp, firstUserId }: RecentOrdersProps = {}) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 8,
  });

  const columns = useMemo<ColumnDef<OrderRow>[]>(
    () => [
      {
        accessorKey: "orderId",
        header: "ID",
        cell: ({ row }) => (
          <span className="font-normal tabular-nums">
            #{row.original.orderId}
          </span>
        ),
      },
      {
        accessorKey: "fullName",
        header: "Kund",
        cell: ({ row }) => {
          const name = row.original.fullName;
          return (
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={undefined} alt={name} />
                <AvatarFallback className="text-xs">
                  {getInitials(name)}
                </AvatarFallback>
              </Avatar>
              <span className="font-normal">{name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "productName",
        header: "Produkt",
        cell: ({ row }) => (
          <span className="font-normal">{row.original.productName}</span>
        ),
      },
      {
        accessorKey: "amount",
        header: ({ column }) => (
          <div className="text-right pr-12">
            <Button
              variant="ghost"
              className="-ml-2 h-8"
              onClick={() => column.toggleSorting()}
            >
              Belopp
              {column.getIsSorted() === "asc" ? (
                <ArrowUp className="ml-1 h-4 w-4" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown className="ml-1 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
              )}
            </Button>
          </div>
        ),
        cell: ({ row }) => {
          const amount = row.original.amount;
          const formatted = new Intl.NumberFormat("sv-SE", {
            style: "currency",
            currency: "SEK",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(amount);
          return <div className="text-right font-normal pr-12">{formatted}</div>;
        },
      },
      {
        accessorKey: "status",
        header: () => <span className="pl-8">Status</span>,
        cell: ({ row }) => {
          const status = String(row.original.status);
          const config =
            statusConfig[status] ?? {
              label: status,
              className: "bg-muted/50 text-muted-foreground border border-border",
            };
          return (
            <div className="pl-8">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                  config.className
                )}
              >
                {config.label}
              </span>
            </div>
          );
        },
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const order = row.original;
          const isRealData = ordersProp && ordersProp.length > 0;
          const customerId = isRealData ? order.userId : firstUserId ?? order.userId;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Öppna meny</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    navigator.clipboard.writeText(`#${order.orderId}`)
                  }
                >
                  Kopiera order-ID
                </DropdownMenuItem>
                {customerId && (
                  <DropdownMenuItem asChild>
                    <Link href={`/studio/users/${customerId}`}>Visa kund</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href={`/studio/payments/${order.id}`}>
                    Visa betalningsinformation
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/studio/payments/${order.id}`}>Visa leveransdetaljer</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/studio/payments">Visa alla ordrar</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [ordersProp, firstUserId]
  );

  const data = ordersProp && ordersProp.length > 0 ? ordersProp : MOCK_ORDERS;
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
    const headers = ["ID", "Kund", "Produkt", "Belopp", "Status"];
    const csvRows = [
      headers.join(";"),
      ...rows.map((r) => {
        const status = statusConfig[r.status]?.label ?? r.status;
        const amount = new Intl.NumberFormat("sv-SE", {
          style: "currency",
          currency: "SEK",
          minimumFractionDigits: 2,
        }).format(r.amount);
        return [`#${r.orderId}`, r.fullName, r.productName, amount, status].join(";");
      }),
    ];
    const csv = csvRows.join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `ordrar-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportToPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const { autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF();
    const rows = table.getFilteredRowModel().rows.map((row) => row.original);
    const headers = ["ID", "Kund", "Produkt", "Belopp", "Status"];
    const body = rows.map((r) => {
      const status = statusConfig[r.status]?.label ?? r.status;
      const amount = new Intl.NumberFormat("sv-SE", {
        style: "currency",
        currency: "SEK",
        minimumFractionDigits: 2,
      }).format(r.amount);
      return [`#${r.orderId}`, r.fullName, r.productName, amount, status];
    });
    doc.setFontSize(16);
    doc.text("Senaste ordrar", 14, 20);
    autoTable(doc, {
      startY: 28,
      head: [headers],
      body,
      styles: { fontSize: 9 },
      theme: "grid",
    });
    doc.save(`ordrar-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const toolbar = (
    <div className="flex gap-2">
      <Input
        placeholder="Filtrera ordrar..."
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
          {!hideTitle && <h1 className="text-lg font-semibold">Senaste ordrar</h1>}
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
          placeholder="Filtrera ordrar..."
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
                  Inga ordrar att visa.
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
