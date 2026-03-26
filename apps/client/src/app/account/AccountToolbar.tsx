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

  return (
    <nav
      className="inline-flex rounded-lg bg-muted p-1 gap-0.5 ml-auto [&_button]:cursor-pointer"
      data-account-toolbar="v2"
      aria-label="Account"
    >
      <button
        type="button"
        onClick={onOpenAddress}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
      >
        <MapPin className="w-4 h-4" />
        {t("nav.deliveryAddress")}
        <ChevronRight className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onOpenExport}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
      >
        <Download className="w-4 h-4" />
        {t("account.exportData")}
        <ChevronRight className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onOpenDelete}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-destructive/90 hover:text-destructive hover:bg-background transition-colors"
      >
        <AlertTriangle className="w-4 h-4" />
        {t("account.deleteAccount")}
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
}
