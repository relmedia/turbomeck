"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { cn } from "@/lib/utils";
import { ChevronDown, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Skeleton } from "@repo/ui/components/skeleton";

type LocationRow = {
  name: string;
  change: number;
  percent: number;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SalesByLocation() {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sales-by-location");
      const list = res.ok ? await res.json() : [];
      setLocations(list);
    } catch {
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const exportToExcel = () => {
    const headers = ["Plats", "Förändring", "Andel"];
    const csvRows = [
      headers.join(";"),
      ...locations.map((r) =>
        [r.name, `${r.change >= 0 ? "+" : ""}${r.change}%`, `${r.percent}%`].join(";")
      ),
    ];
    const csv = csvRows.join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `forsaljning-per-plats-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportToPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const { autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF();
    const headers = ["Plats", "Förändring", "Andel"];
    const body = locations.map((r) => [
      r.name,
      `${r.change >= 0 ? "+" : ""}${r.change}%`,
      `${r.percent}%`,
    ]);
    doc.setFontSize(16);
    doc.text("Försäljning per plats", 14, 20);
    doc.setFontSize(10);
    doc.text("Intäkter de senaste 28 dagarna", 14, 28);
    autoTable(doc, {
      startY: 34,
      head: [headers],
      body,
      styles: { fontSize: 9 },
      theme: "grid",
    });
    doc.save(`forsaljning-per-plats-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const renderContent = () => {
    if (loading && locations.length === 0) {
      return (
        <div className="space-y-6 py-1">
          {[0, 1, 2].map((key) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-14 rounded-md" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-2 flex-1 rounded-full" />
                <Skeleton className="h-4 w-10" />
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (locations.length === 0) {
      return (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Inga försäljningar de senaste 28 dagarna
        </p>
      );
    }
    return locations.map((loc) => (
      <div key={loc.name} className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{loc.name}</span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium",
              loc.change >= 0
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            )}
          >
            {loc.change >= 0 ? "+" : ""}
            {loc.change}%
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-foreground rounded-full transition-all"
              style={{ width: `${loc.percent}%` }}
            />
          </div>
          <span className="text-sm font-medium tabular-nums w-10 text-right">
            {loc.percent}%
          </span>
        </div>
      </div>
    ));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Försäljning per plats</h1>
          <p className="text-sm text-muted-foreground">
            Intäkter de senaste 28 dagarna
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchLocations}
            disabled={loading}
            aria-label="Uppdatera"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Exportera
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportToExcel}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Excel (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportToPdf}>
                <FileText className="mr-2 h-4 w-4" />
                PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="space-y-4">
        {renderContent()}
      </div>
    </div>
  );
}
