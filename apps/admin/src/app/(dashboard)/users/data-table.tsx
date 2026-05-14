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
} from "@repo/ui/components/table";
import { DataTablePagination } from "@/components/TablePagination";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { useMemo, useState } from "react";
import { Filter, LayoutList, Tag, Trash2 } from "lucide-react";

import type { User } from "./columns";

const userGlobalFilterFn: FilterFn<User> = (row, _columnId, filterValue) => {
  const val = String(filterValue ?? "").toLowerCase();
  if (!val) return true;
  const u = row.original;
  return [u.fullName, u.email].some((s) => String(s).toLowerCase().includes(val));
};

const columnLabels: Record<string, string> = {
  select: "Markering",
  avatar: "Avatar",
  fullName: "Namn",
  email: "E-post",
  status: "Status",
  actions: "Åtgärder",
};

interface DataTableProps {
  columns: ColumnDef<User, unknown>[];
  data: User[];
  onDeleteSelected?: (selectedRows: User[]) => void | Promise<void>;
}

export function DataTable({
  columns,
  data,
  onDeleteSelected,
}: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilters, setStatusFilters] = useState({ aktiv: true, inaktiv: true });
  const [profileFilters, setProfileFilters] = useState({
    withAvatar: true,
    withoutAvatar: true,
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const filteredData = useMemo(() => {
    const hasStatusFilter =
      (statusFilters.aktiv || statusFilters.inaktiv) &&
      !(statusFilters.aktiv && statusFilters.inaktiv);
    const hasProfileFilter =
      (profileFilters.withAvatar || profileFilters.withoutAvatar) &&
      !(profileFilters.withAvatar && profileFilters.withoutAvatar);

    return data.filter((row) => {
      const u = row;
      if (hasStatusFilter) {
        const ok =
          (statusFilters.aktiv && u.status === "aktiv") ||
          (statusFilters.inaktiv && u.status === "inaktiv");
        if (!ok) return false;
      }
      if (hasProfileFilter) {
        const hasPic = Boolean(u.avatar?.trim());
        const ok =
          (profileFilters.withAvatar && hasPic) ||
          (profileFilters.withoutAvatar && !hasPic);
        if (!ok) return false;
      }
      return true;
    });
  }, [data, statusFilters, profileFilters]);

  const table = useReactTable({
    data: filteredData,
    columns,
    getRowId: (row) => row.id,
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
    globalFilterFn: userGlobalFilterFn,
  });

  const selectedRows = table
    .getFilteredSelectedRowModel()
    .rows.map((r) => r.original);
  const hasSelection = selectedRows.length > 0;
  const selectedCount = selectedRows.length;

  const handleDeleteSelected = async () => {
    if (!onDeleteSelected || !hasSelection) return;
    setConfirmOpen(false);
    setIsDeleting(true);
    try {
      await onDeleteSelected(selectedRows);
      setRowSelection({});
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Input
            placeholder="Sök namn eller e-post..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="max-w-sm"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-1.5" />
                Status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuCheckboxItem
                checked={statusFilters.aktiv}
                onCheckedChange={(v) =>
                  setStatusFilters((s) => ({ ...s, aktiv: !!v }))
                }
                onSelect={(e) => e.preventDefault()}
              >
                Aktiv
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={statusFilters.inaktiv}
                onCheckedChange={(v) =>
                  setStatusFilters((s) => ({ ...s, inaktiv: !!v }))
                }
                onSelect={(e) => e.preventDefault()}
              >
                Inaktiv
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Tag className="w-4 h-4 mr-1.5" />
                Typ
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuCheckboxItem
                checked={profileFilters.withAvatar}
                onCheckedChange={(v) =>
                  setProfileFilters((s) => ({ ...s, withAvatar: !!v }))
                }
                onSelect={(e) => e.preventDefault()}
              >
                Med profilbild
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={profileFilters.withoutAvatar}
                onCheckedChange={(v) =>
                  setProfileFilters((s) => ({ ...s, withoutAvatar: !!v }))
                }
                onSelect={(e) => e.preventDefault()}
              >
                Utan profilbild
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {selectedCount > 0 && onDeleteSelected && (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={isDeleting}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Ta bort ({selectedCount})
              </Button>
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Ta bort valda användare?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Du håller på att ta bort {selectedRows.length} användare.
                      Konto, sessioner och recensioner raderas permanent. Eventuella
                      ordrar bevaras för historik. Denna åtgärd kan inte ångras.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>
                      Avbryt
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteSelected}
                      disabled={isDeleting}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      {isDeleting ? "Tar bort..." : "Ta bort permanent"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <LayoutList className="w-4 h-4 mr-1.5" />
                Kolumner
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
                    {columnLabels[col.id] ?? col.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="rounded-md border bg-card">
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
                            header.getContext(),
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
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Inga användare matchar filtren.
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
