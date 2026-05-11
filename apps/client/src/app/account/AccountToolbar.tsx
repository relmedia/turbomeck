"use client";

import { MapPin, Download, Trash2, ChevronRight } from "lucide-react";
import { useTranslation } from "@/i18n/context";

/** Profile quick actions only (no password — login is magic link / OAuth). */
export function AccountToolbar({
  onOpenAddress,
  onOpenExport,
  onOpenDelete,
}: {
  onOpenAddress: () => void;
  onOpenExport: () => void;
  onOpenDelete: () => void;
}) {
  const t = useTranslation();

  return (
    <nav
      aria-label="Account actions"
      data-account-toolbar="v4"
      className={[
        // Mobile: full-width card-style list with dividers
        "flex w-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm",
        "divide-y divide-border/70",
        // sm+: inline pill row, aligned right, vertical dividers between items
        "sm:w-auto sm:flex-row sm:divide-y-0 sm:divide-x sm:divide-border/70",
        "sm:rounded-lg sm:ml-auto",
      ].join(" ")}
    >
      <ToolbarItem
        icon={<MapPin className="h-4 w-4" />}
        label={t("nav.deliveryAddress")}
        onClick={onOpenAddress}
      />
      <ToolbarItem
        icon={<Download className="h-4 w-4" />}
        label={t("account.exportData")}
        onClick={onOpenExport}
      />
      <ToolbarItem
        icon={<Trash2 className="h-4 w-4" />}
        label={t("account.deleteAccount")}
        onClick={onOpenDelete}
        destructive
      />
    </nav>
  );
}

function ToolbarItem({
  icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group relative inline-flex items-center gap-3 text-left cursor-pointer",
        // Mobile sizing — generous touch target, full row
        "w-full justify-between px-4 py-3.5",
        // sm+ sizing — compact inline pill item
        "sm:w-auto sm:justify-start sm:px-3.5 sm:py-2.5",
        // States
        "transition-colors outline-none",
        "hover:bg-muted/60 focus-visible:bg-muted/60",
        "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
      ].join(" ")}
    >
      <span className="inline-flex items-center gap-3 min-w-0">
        <span
          className={[
            "inline-flex shrink-0 items-center justify-center rounded-md transition-colors",
            // Mobile icon tile
            "h-9 w-9",
            // sm+ icon tile (compact)
            "sm:h-7 sm:w-7",
            destructive
              ? "bg-destructive/10 text-destructive group-hover:bg-destructive/15"
              : "bg-muted text-muted-foreground group-hover:text-foreground",
          ].join(" ")}
          aria-hidden
        >
          {icon}
        </span>
        <span
          className={[
            "text-sm font-medium truncate transition-colors",
            destructive
              ? "text-destructive"
              : "text-foreground/90 group-hover:text-foreground",
          ].join(" ")}
        >
          {label}
        </span>
      </span>

      {/* Chevron only on mobile rows (desktop pills don't need it) */}
      <ChevronRight
        aria-hidden
        className={[
          "h-4 w-4 shrink-0 transition-transform sm:hidden",
          destructive
            ? "text-destructive/60 group-hover:text-destructive"
            : "text-muted-foreground/60 group-hover:translate-x-0.5 group-hover:text-foreground",
        ].join(" ")}
      />
    </button>
  );
}
