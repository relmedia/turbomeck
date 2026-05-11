"use client";

import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Badge } from "@repo/ui/components/badge";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal, Star } from "lucide-react";
import Image from "next/image";
import { resolveImageUrl } from "@/lib/image-utils";
import Link from "next/link";
import { useState } from "react";
import { Checkbox } from "@repo/ui/components/checkbox";

export type Product = {
  id: string | number;
  price: number;
  name: string;
  shortDescription?: string;
  description?: string;
  image: string | null;
  categoryIds: number[];
  stock?: number;
  sku?: string;
  averageRating?: number | null;
  reviewCount?: number;
};

function DeleteProductDialog({
  product,
  onDelete,
  trigger,
}: {
  product: Product;
  onDelete?: (ids: number[]) => Promise<void>;
  trigger: (openDialog: () => void) => React.ReactNode;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete([Number(product.id)]);
      setOpen(false);
    } catch (error) {
      console.error("Error deleting product:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      {trigger(() => setOpen(true))}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Är du säker?</AlertDialogTitle>
            <AlertDialogDescription>
              Du håller på att ta bort produkten <strong>&quot;{product.name}&quot;</strong>.
              Denna åtgärd kan inte ångras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting ? "Raderar..." : "Ta bort"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export const createColumns = (
  onDelete?: (ids: number[]) => Promise<void>,
  categories: {
    id: number;
    name: string;
    parentId?: number | null;
    parentName?: string | null;
  }[] = []
): ColumnDef<Product>[] => {
  const categoryMap = Object.fromEntries(
    categories.map((c) => [
      c.id,
      c.parentName ? `${c.parentName} › ${c.name}` : c.name,
    ])
  );

  return [
  {
    id: "select",
    header: ({ table }: { table: { getIsAllPageRowsSelected: () => boolean; getIsSomePageRowsSelected: () => boolean; toggleAllPageRowsSelected: (v: boolean) => void } }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Välj alla"
      />
    ),
    cell: ({ row }: { row: { getIsSelected: () => boolean; toggleSelected: (v: boolean) => void } }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Välj rad"
      />
    ),
    enableHiding: false,
  },
  {
    id: "product",
    accessorKey: "name",
    header: ({ column }: { column: { toggleSorting: (asc: boolean) => void; getIsSorted: () => string | false } }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Produkt namn
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }: { row: { original: Product } }) => {
      const product = row.original;
      return (
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 relative rounded-md overflow-hidden bg-muted shrink-0">
            {product.image ? (
              <Image
                src={resolveImageUrl(product.image)}
                alt={product.name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                —
              </div>
            )}
          </div>
          <span className="font-normal text-foreground">{product.name}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "price",
    header: ({ column }: { column: { toggleSorting: (asc: boolean) => void; getIsSorted: () => string | false } }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Pris
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }: { row: { original: Product } }) => {
      const price = row.original.price;
      return typeof price === "number" ? `${price.toLocaleString("sv-SE")} kr` : price;
    },
  },
  {
    accessorKey: "categoryIds",
    header: ({ column }: { column: { toggleSorting: (asc: boolean) => void; getIsSorted: () => string | false } }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Kategori
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }: { row: { original: Product } }) => {
      const ids = row.original.categoryIds ?? [];
      const names = ids
        .map((id) => categoryMap[id])
        .filter((n): n is string => typeof n === "string" && n.length > 0);
      const fullText = names.join(", ");
      const shortNames = names.map((n) => n.replace(/^Alla Produkter › /i, ""));
      const text = shortNames.join(", ");
      return names.length > 0 ? (
        <span className="text-muted-foreground truncate block max-w-[220px]" title={fullText}>
          {text}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: "stock",
    header: ({ column }: { column: { toggleSorting: (asc: boolean) => void; getIsSorted: () => string | false } }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Lager
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }: { row: { original: Product } }) =>
      row.original.stock != null ? String(row.original.stock) : "—",
  },
  {
    accessorKey: "sku",
    header: ({ column }: { column: { toggleSorting: (asc: boolean) => void; getIsSorted: () => string | false } }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        SKU
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }: { row: { original: Product } }) =>
      row.original.sku ?? "—",
  },
  {
    id: "rating",
    header: "Betyg",
    cell: ({ row }: { row: { original: Product } }) => {
      const avg = row.original.averageRating;
      const count = row.original.reviewCount ?? 0;
      return (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Star className={`w-4 h-4 ${avg != null ? "fill-amber-400 text-amber-400" : ""}`} />
          {avg != null ? `${avg}${count > 0 ? ` (${count})` : ""}` : "—"}
        </span>
      );
    },
  },
  {
    id: "status",
    header: ({ column }: { column: { toggleSorting: (asc: boolean) => void; getIsSorted: () => string | false } }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Status
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    accessorFn: (row: Product) => {
      const stock = row.stock ?? 0;
      if (stock <= 0) return "Out Of Stock";
      return "Active";
    },
    cell: ({ row }: { row: { original: Product } }) => {
      const stock = row.original.stock ?? 0;
      const status = stock <= 0 ? "Out Of Stock" : "Active";
      const variant = status === "Active" ? "default" : status === "Out Of Stock" ? "secondary" : "destructive";
      const label = status === "Active" ? "Aktiv" : stock <= 0 ? "Slutsåld" : status;
      return (
        <Badge variant={variant} className={status === "Active" ? "border-green-600 bg-green-50 text-green-800 dark:bg-green-950/50 dark:text-green-400 dark:border-green-500" : status === "Out Of Stock" ? "bg-amber-500 hover:bg-amber-500" : ""}>
          {label}
        </Badge>
      );
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row, table }: { row: { original: Product }; table: { getState: () => { pagination: { pageIndex: number } } } }) => {
      const product = row.original;
      const page = table.getState().pagination.pageIndex + 1;
      const fromQuery = page > 1 ? `?fromPage=${page}` : "";

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/products/${product.id}/view${fromQuery}`}>Visa detaljer</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(String(product.id))}
            >
              Kopiera produkt ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/products/${product.id}${fromQuery}`}>Redigera</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DeleteProductDialog
              product={product}
              onDelete={onDelete}
              trigger={(openDialog) => (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    openDialog();
                  }}
                  className="text-destructive focus:text-destructive cursor-pointer"
                >
                  Ta bort produkt
                </DropdownMenuItem>
              )}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
};

// Keep backwards compatibility
export const columns = createColumns();
