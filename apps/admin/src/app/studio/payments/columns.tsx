"use client";

import { useState } from "react";
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
import { cn } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";

export type Payment = {
  id: string;
  orderId?: number;
  amount: number;
  fullName: string;
  userId: string;
  email: string;
  status: "pending" | "processing" | "success" | "failed" | "shipped" | "delivered";
  productName?: string;
  productImage?: string;
  date?: string;
  type?: "sale" | "return";
};

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Väntar", className: "bg-amber-50 text-amber-700 border border-amber-200" },
  success: { label: "Slutförd", className: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  completed: { label: "Slutförd", className: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  shipped: { label: "Skickad", className: "bg-gray-100 text-gray-700 border border-gray-200" },
  delivered: { label: "Levererad", className: "bg-emerald-50 text-emerald-600 border border-emerald-200" },
  failed: { label: "Avbruten", className: "bg-red-50 text-red-700 border border-red-200" },
};

function DeleteOrderDialog({
  payment,
  onDelete,
}: {
  payment: Payment;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(payment.id);
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
          <AlertDialogTitle>Ta bort order?</AlertDialogTitle>
          <AlertDialogDescription>
            Du håller på att ta bort order #{payment.orderId ?? payment.id} för {payment.fullName}.
            Orderrader och data tas bort permanent. Denna åtgärd kan inte ångras.
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

export const createColumns = (onDelete?: (id: string) => Promise<void>): ColumnDef<Payment>[] => [
  {
    id: "select",
    enableHiding: false,
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
    accessorKey: "orderId",
    header: "#",
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">{row.original.orderId ?? row.original.id.slice(-6)}</span>
    ),
  },
  {
    accessorKey: "productName",
    header: "Produkt",
    cell: ({ row }) => {
      const name = row.original.productName ?? "-";
      const img = row.original.productImage;
      return (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
            {img ? (
              <img src={img} alt={name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-muted-foreground text-xs">—</span>
            )}
          </div>
          <span className="font-medium">{name}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "amount",
    header: () => <div className="text-right">Belopp</div>,
    cell: ({ row }) => {
      const amount = parseFloat(String(row.getValue("amount")));
      const formatted = new Intl.NumberFormat("sv-SE", {
        style: "currency",
        currency: "SEK",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
      return <div className="text-right font-medium">{formatted}</div>;
    },
  },
  {
    id: "customer",
    header: "Kund",
    cell: ({ row }) => {
      const p = row.original;
      return (
        <div className="flex flex-col">
          <span className="font-medium">{p.fullName}</span>
          <span className="text-sm text-muted-foreground">{p.email}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "date",
    header: "Datum",
    cell: ({ row }) => {
      const date = row.original.date;
      if (!date) return "-";
      return (
        <span className="text-muted-foreground">
          {new Date(date).toLocaleDateString("sv-SE", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      );
    },
  },
  {
    accessorKey: "type",
    header: "Typ",
    cell: ({ row }) => (
      <span className="text-sm">{row.original.type === "return" ? "Retur" : "Försäljning"}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = String(row.getValue("status"));
      const config = statusConfig[status] ?? {
        label: status,
        className: "bg-muted/50 text-muted-foreground border border-border",
      };
      return (
        <span
          className={cn(
            "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium",
            config.className
          )}
        >
          {config.label}
        </span>
      );
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const payment = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Öppna meny</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Åtgärder</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(payment.id)}
            >
              Kopiera betalnings ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/studio/payments/${payment.id}`} className="flex items-center">
                Visa kunddata
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DeleteOrderDialog payment={payment} onDelete={onDelete} />
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
