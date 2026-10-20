"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Button } from "@repo/ui/components/button";
import { Copy, ExternalLink, Mail, MoreHorizontal, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { toast } from "react-toastify";
import { formatAmount, normalizeCurrency } from "@repo/currency";
import type { RefundRow } from "./page";

/** Swedish labels for the payment slot a refund was taken from. */
const CHARGE_KIND_LABELS: Record<string, string> = {
  full: "Betalning",
  deposit: "Deposition",
  balance: "Restbetalning",
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  succeeded: {
    label: "Genomförd",
    className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
  pending: {
    label: "Väntar",
    className: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  failed: {
    label: "Misslyckades",
    className: "bg-red-50 text-red-700 border border-red-200",
  },
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} kopierat till urklipp`);
  } catch {
    toast.error("Kunde inte kopiera");
  }
}

export function createRefundColumns(): ColumnDef<RefundRow>[] {
  return [
    {
      accessorKey: "createdAt",
      header: "Datum",
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap">
          {formatDateTime(row.original.createdAt)}
        </span>
      ),
    },
    {
      accessorKey: "customerName",
      header: "Kund",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{row.original.customerName}</p>
          <p className="text-xs text-muted-foreground truncate">{row.original.email}</p>
        </div>
      ),
    },
    {
      accessorKey: "orderNumber",
      header: "Order",
      cell: ({ row }) => (
        <Link
          href={`/payments/${row.original.orderId}`}
          className="text-sm text-sky-600 hover:text-sky-700 hover:underline whitespace-nowrap"
        >
          {row.original.orderNumber}
        </Link>
      ),
    },
    {
      accessorKey: "amount",
      header: () => <div className="text-right">Återbetalat</div>,
      cell: ({ row }) => {
        const { amount, currency, orderTotal } = row.original;
        const cur = normalizeCurrency(currency);
        // A partial refund is worth seeing as a fraction: "500 kr" alone does
        // not say whether the customer got a little back or everything.
        const partial = orderTotal != null && amount < orderTotal - 1e-9;
        return (
          <div className="text-right whitespace-nowrap">
            <p className="text-sm font-semibold">{formatAmount(amount, cur)}</p>
            {partial && (
              <p className="text-[11px] text-muted-foreground">
                av {formatAmount(orderTotal, cur)}
              </p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "chargeKind",
      header: "Avser",
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap">
          {CHARGE_KIND_LABELS[row.original.chargeKind] ?? row.original.chargeKind}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const cfg = STATUS_CONFIG[row.original.status] ?? {
          label: row.original.status,
          className: "bg-gray-100 text-gray-700 border border-gray-200",
        };
        return (
          <div className="space-y-0.5">
            <span className={`inline-block rounded px-2 py-0.5 text-xs ${cfg.className}`}>
              {cfg.label}
            </span>
            {row.original.failureReason && (
              <p className="text-[11px] text-destructive max-w-[220px] truncate">
                {row.original.failureReason}
              </p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "performedBy",
      header: "Av",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground break-all">
          {row.original.performedBy ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "emailSent",
      header: "Mejl",
      cell: ({ row }) =>
        row.original.emailSent ? (
          <span className="text-xs text-emerald-700">Skickat</span>
        ) : (
          <span className="text-xs text-muted-foreground">Nej</span>
        ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Öppna meny</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium">{r.customerName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatAmount(r.amount, normalizeCurrency(r.currency))} ·{" "}
                  {r.orderNumber}
                </p>
                {r.note && (
                  <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/payments/${r.orderId}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Öppna ordern
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => copy(r.email, "E-post")} disabled={!r.email}>
                <Mail className="mr-2 h-4 w-4" />
                Kopiera e-post
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => copy(r.stripeRefundId ?? "", "Stripe-ID")}
                disabled={!r.stripeRefundId}
              >
                <Copy className="mr-2 h-4 w-4" />
                Kopiera Stripe-ID
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => copy(r.performedBy ?? "", "Handläggare")}
                disabled={!r.performedBy}
              >
                <User className="mr-2 h-4 w-4" />
                Kopiera handläggare
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
