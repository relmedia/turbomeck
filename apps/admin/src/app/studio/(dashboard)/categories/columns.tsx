"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
export type Category = {
  id: number;
  name: string;
  nameEn?: string | null;
  description?: string | null;
  parentId?: number | null;
  parentName?: string | null;
  createdAt: string;
};

function DeleteCategoryDialog({
  category,
  onDelete,
}: {
  category: Category;
  onDelete?: (id: number) => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(category.id);
      setOpen(false);
    } catch (error) {
      console.error("Error deleting category:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="text-destructive focus:text-destructive cursor-pointer"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Ta bort kategori
        </DropdownMenuItem>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Är du säker?</AlertDialogTitle>
          <AlertDialogDescription>
            Du håller på att ta bort kategorin <strong>&quot;{category.name}&quot;</strong>.
            Produkter i denna kategori kommer att bli utan kategori.
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
  );
}

export const createColumns = (
  onDelete?: (id: number) => Promise<void>,
  onEdit?: (category: Category) => void
): ColumnDef<Category>[] => [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        checked={row.getIsSelected()}
      />
    ),
  },
  {
    accessorKey: "name",
    header: "Namn",
  },
  {
    accessorKey: "parentName",
    header: "Huvudkategori",
    cell: ({ row }) => {
      const parentName = row.original.parentName;
      return (
        <span className="text-muted-foreground">
          {parentName ?? "—"}
        </span>
      );
    },
  },
  {
    accessorKey: "description",
    header: "Beskrivning",
    cell: ({ row }) => {
      const desc = row.original.description;
      return (
        <span className="text-muted-foreground text-sm truncate max-w-[200px] block">
          {desc ?? "—"}
        </span>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const category = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Öppna meny</span>
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Åtgärder</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onEdit?.(category)}
              className="cursor-pointer"
            >
              <Pencil className="w-4 h-4 mr-2" />
              Redigera namn
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DeleteCategoryDialog category={category} onDelete={onDelete} />
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
