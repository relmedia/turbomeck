"use client";

import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Star, MoreHorizontal, Eye, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useState } from "react";

export type Review = {
  id: number;
  productId: number;
  productName: string;
  userName: string;
  rating: number;
  title: string | null;
  comment: string | null;
  createdAt: string;
  editedAt: string | null;
};

function DeleteReviewDialog({
  review,
  onDelete,
}: {
  review: Review;
  onDelete?: (id: number) => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(review.id);
      setOpen(false);
    } catch (err) {
      console.error("Delete failed:", err);
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
          Ta bort
        </DropdownMenuItem>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ta bort recension?</AlertDialogTitle>
          <AlertDialogDescription>
            Du håller på att ta bort recensionen för &quot;{review.productName}&quot; från {review.userName}.
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
            {isDeleting ? "Tar bort..." : "Ta bort"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export const createColumns = (
  onView?: (review: Review) => void,
  onDelete?: (id: number) => Promise<void>
): ColumnDef<Review>[] => [
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
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <span className="text-muted-foreground font-mono text-sm">{row.getValue("id")}</span>
    ),
  },
  {
    accessorKey: "productName",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Produkt
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const productId = row.original.productId;
      const name = row.getValue("productName") as string;
      return (
        <Link
          href={`/products/${productId}`}
          className="text-primary hover:underline font-medium"
        >
          {name}
        </Link>
      );
    },
  },
  {
    accessorKey: "userName",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Användare
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: "rating",
    header: "Betyg",
    cell: ({ row }) => {
      const rating = row.getValue("rating") as number;
      return (
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              className={cn(
                "h-4 w-4",
                i <= rating ? "fill-amber-400 text-amber-400" : "text-gray-200"
              )}
            />
          ))}
          <span className="ml-1 text-sm text-muted-foreground">({rating})</span>
        </div>
      );
    },
  },
  {
    accessorKey: "title",
    header: "Rubrik",
    cell: ({ row }) => {
      const title = row.getValue("title") as string | null;
      return title ? (
        <span className="max-w-[200px] truncate block" title={title}>
          {title}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: "comment",
    header: "Kommentar",
    cell: ({ row }) => {
      const comment = row.getValue("comment") as string | null;
      return comment ? (
        <span className="max-w-[250px] truncate block" title={comment}>
          {comment}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Skapad
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const date = row.getValue("createdAt") as string;
      return new Date(date).toLocaleDateString("sv-SE", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
  },
  {
    accessorKey: "editedAt",
    header: "Redigerad",
    cell: ({ row }) => {
      const editedAt = row.getValue("editedAt") as string | null;
      return editedAt ? (
        new Date(editedAt).toLocaleDateString("sv-SE", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const review = row.original;
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
              onClick={() => onView?.(review)}
              className="cursor-pointer"
            >
              <Eye className="w-4 h-4 mr-2" />
              Visa
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/reviews/${review.id}/edit`} className="flex items-center">
                <Pencil className="w-4 h-4 mr-2" />
                Redigera
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DeleteReviewDialog review={review} onDelete={onDelete} />
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
