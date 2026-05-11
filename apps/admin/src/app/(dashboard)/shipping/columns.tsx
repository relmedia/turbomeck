"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Button } from "@repo/ui/components/button";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ShippingRow } from "./page";

const statusConfig: Record<string, { label: string; className: string }> = {
  confirmed: { label: "Behandlas", className: "bg-blue-50 text-blue-700 border border-blue-200" },
  shipped: { label: "Skickad", className: "bg-sky-50 text-sky-700 border border-sky-200" },
  delivered: { label: "Levererad", className: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  cancelled: { label: "Avbruten", className: "bg-red-50 text-red-700 border border-red-200" },
};

function toValidTrackingId(val: unknown): string {
  if (val == null) return "";
  const s = String(val).trim();
  return s && s.toLowerCase() !== "null" ? s : "";
}

export const createShippingColumns = (): ColumnDef<ShippingRow>[] => [
  {
    accessorKey: "orderId",
    header: "#",
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">
        {row.original.orderNumber ?? `#${row.original.orderId}`}
      </span>
    ),
  },
  {
    accessorKey: "fullName",
    header: "Kund",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.original.fullName}</span>
        <span className="text-xs text-muted-foreground">{row.original.email}</span>
      </div>
    ),
  },
  {
    accessorKey: "phone",
    header: "Telefon",
    cell: ({ row }) => (
      <span className="text-sm">{row.original.phone ?? "—"}</span>
    ),
  },
  {
    accessorKey: "address",
    header: "Adress",
    cell: ({ row }) => {
      const r = row.original;
      const line1 = [r.address, [r.postalCode, r.city].filter(Boolean).join(" "), r.country]
        .filter(Boolean)
        .join(", ");
      return (
        <div className="max-w-[200px]">
          <span className="text-sm">{line1}</span>
          {r.servicePointName && (
            <span className="block text-xs text-muted-foreground mt-0.5">
              Ombud: {r.servicePointName}
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "deliveryOption",
    header: "Leveranstyp",
    cell: ({ row }) => (
      <span className="text-sm capitalize">
        {row.original.deliveryOption === "servicepoint" ? "Ombud" : "Hemleverans"}
      </span>
    ),
  },
  {
    accessorKey: "postNordTrackingId",
    header: "Spårningsnr",
    cell: ({ row }) => {
      const tid = toValidTrackingId(row.original.postNordTrackingId);
      if (!tid) return <span className="text-muted-foreground">—</span>;
      return (
        <a
          href={`https://www.postnord.se/en/our-tools/track-and-trace?shipmentId=${encodeURIComponent(tid)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-600 hover:text-sky-700 hover:underline text-sm"
        >
          {tid}
        </a>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = String(row.original.status);
      const config = statusConfig[status] ?? {
        label: row.original.statusLabel ?? status,
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
    accessorKey: "createdAt",
    header: "Datum",
    cell: ({ row }) => {
      const date = row.original.createdAt;
      if (!date) return "—";
      return (
        <span className="text-sm text-muted-foreground">
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
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const id = row.original.id;
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
              <Link href={`/payments/${id}`}>
                Visa order
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
