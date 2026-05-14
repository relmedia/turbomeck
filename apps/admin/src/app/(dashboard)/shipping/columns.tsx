"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Button } from "@repo/ui/components/button";
import {
  Copy,
  ExternalLink,
  Hash,
  Mail,
  MoreHorizontal,
  Truck,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { toast } from "react-toastify";
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
      const r = row.original;
      const tid = toValidTrackingId(r.postNordTrackingId);
      const statusDisplay = statusConfig[r.status]?.label ?? r.statusLabel ?? r.status;
      const orderNumDisplay = r.orderNumber?.trim() || String(r.orderId);
      const emailRaw = r.email?.trim() ?? "";
      const hasMailto = emailRaw.includes("@");
      const phoneRaw = r.phone?.trim() ?? "";

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Öppna meny</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-tight text-foreground">
                  {r.fullName}
                </span>
                <span className="text-xs leading-tight text-muted-foreground">
                  {orderNumDisplay} · {statusDisplay}
                </span>
                <span className="text-xs leading-tight text-muted-foreground break-all">
                  {r.email || "—"}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(r.id);
                  toast.success("Order-ID kopierat till urklipp");
                } catch {
                  toast.error("Kunde inte kopiera order-ID");
                }
              }}
            >
              <Copy className="w-4 h-4 mr-2" />
              Kopiera order-ID
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(orderNumDisplay);
                  toast.success("Ordernummer kopierat till urklipp");
                } catch {
                  toast.error("Kunde inte kopiera ordernummer");
                }
              }}
            >
              <Hash className="w-4 h-4 mr-2" />
              Kopiera ordernummer
            </DropdownMenuItem>
            {tid ? (
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(tid);
                    toast.success("Spårningsnummer kopierat till urklipp");
                  } catch {
                    toast.error("Kunde inte kopiera spårningsnummer");
                  }
                }}
              >
                <Copy className="w-4 h-4 mr-2" />
                Kopiera spårningsnr
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(r.email);
                  toast.success("E-post kopierad till urklipp");
                } catch {
                  toast.error("Kunde inte kopiera e-post");
                }
              }}
              disabled={!r.email || r.email === "—"}
            >
              <Copy className="w-4 h-4 mr-2" />
              Kopiera e-post
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(phoneRaw);
                  toast.success("Telefon kopierad till urklipp");
                } catch {
                  toast.error("Kunde inte kopiera telefon");
                }
              }}
              disabled={!phoneRaw}
            >
              <Copy className="w-4 h-4 mr-2" />
              Kopiera telefon
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/payments/${r.id}`}>
                <User className="w-4 h-4 mr-2" />
                Visa kunddata
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={`/payments/${r.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Öppna i ny flik
              </Link>
            </DropdownMenuItem>
            {tid ? (
              <DropdownMenuItem asChild>
                <a
                  href={`https://www.postnord.se/en/our-tools/track-and-trace?shipmentId=${encodeURIComponent(tid)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Truck className="w-4 h-4 mr-2" />
                  Spåra hos PostNord
                </a>
              </DropdownMenuItem>
            ) : null}
            {hasMailto ? (
              <DropdownMenuItem asChild>
                <a href={`mailto:${emailRaw}`}>
                  <Mail className="w-4 h-4 mr-2" />
                  Skicka e-post
                </a>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
