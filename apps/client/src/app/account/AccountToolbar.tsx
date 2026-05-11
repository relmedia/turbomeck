"use client";

import { MapPin, Download, AlertTriangle, ChevronRight } from "lucide-react";
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

  // Mobile (<sm): full-width stacked list with chevron pushed right.
  // sm+: original inline pill toolbar aligned to the end.
  const baseItem =
    "inline-flex items-center gap-2 text-sm font-medium rounded-md transition-colors cursor-pointer " +
    // mobile sizing
    "w-full justify-between px-4 py-3 " +
    // sm+ sizing reverts to inline pills
    "sm:w-auto sm:justify-start sm:px-4 sm:py-2";

  const neutral =
    "text-muted-foreground hover:text-foreground hover:bg-background";
  const danger =
    "text-destructive/90 hover:text-destructive hover:bg-background";

  return (
    <nav
      className={
        // mobile: full width vertical stack, no pill background
        "flex w-full flex-col gap-1 rounded-lg " +
        // sm+: original inline pill strip aligned right
        "sm:inline-flex sm:w-auto sm:flex-row sm:gap-0.5 sm:bg-muted sm:p-1 sm:ml-auto"
      }
      data-account-toolbar="v3"
      aria-label="Account"
    >
      <button
        type="button"
        onClick={onOpenAddress}
        className={`${baseItem} ${neutral}`}
      >
        <span className="inline-flex items-center gap-2">
          <MapPin className="w-4 h-4 shrink-0" />
          {t("nav.deliveryAddress")}
        </span>
        <ChevronRight className="w-4 h-4 shrink-0 sm:ml-1" />
      </button>
      <button
        type="button"
        onClick={onOpenExport}
        className={`${baseItem} ${neutral}`}
      >
        <span className="inline-flex items-center gap-2">
          <Download className="w-4 h-4 shrink-0" />
          {t("account.exportData")}
        </span>
        <ChevronRight className="w-4 h-4 shrink-0 sm:ml-1" />
      </button>
      <button
        type="button"
        onClick={onOpenDelete}
        className={`${baseItem} ${danger}`}
      >
        <span className="inline-flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {t("account.deleteAccount")}
        </span>
        <ChevronRight className="w-4 h-4 shrink-0 sm:ml-1" />
      </button>
    </nav>
  );
}
