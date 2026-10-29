"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Skeleton } from "@repo/ui/components/skeleton";
import { ChevronDown, FileSpreadsheet, FileText, Info, RefreshCw } from "lucide-react";

/**
 * Where the people visiting turbomeck.se are.
 *
 * Distinct from "Försäljning per plats" next to it: that one is revenue from
 * orders — an address a customer typed — while this is traffic, located from
 * the request. A country can be busy here and absent there, which is the
 * comparison worth having.
 */

type CountryRow = {
  code: string;
  name: string;
  flag: string;
  visits: number;
  cities: number;
  share: number;
};

type CityRow = {
  city: string;
  countryCode: string | null;
  countryName: string | null;
  flag: string;
  visits: number;
};

type LocationData = {
  days: number;
  totalVisits: number;
  knownVisits: number;
  unknownVisits: number;
  countries: CountryRow[];
  cities: CityRow[];
};

const RANGES = [
  { days: 7, label: "7 dagar" },
  { days: 28, label: "28 dagar" },
  { days: 90, label: "90 dagar" },
  { days: 365, label: "12 månader" },
] as const;

/** How many countries are listed before "visa alla". */
const COLLAPSED_COUNT = 6;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function VisitorsByLocation() {
  const [data, setData] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(28);
  const [tab, setTab] = useState<"countries" | "cities">("countries");
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/locations?days=${range}`);
      if (!res.ok) throw new Error("Kunde inte hämta besökarnas platser");
      setData((await res.json()) as LocationData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ett fel uppstod");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [load, days]);

  const rangeLabel = RANGES.find((r) => r.days === days)?.label ?? `${days} dagar`;

  const exportToExcel = () => {
    if (!data) return;
    const rows =
      tab === "countries"
        ? [
            ["Land", "Besök", "Andel", "Städer"].join(";"),
            ...data.countries.map((c) =>
              [c.name, String(c.visits), `${c.share}%`, String(c.cities)].join(";"),
            ),
          ]
        : [
            ["Stad", "Land", "Besök"].join(";"),
            ...data.cities.map((c) => [c.city, c.countryName ?? "", String(c.visits)].join(";")),
          ];
    if (data.unknownVisits > 0) {
      rows.push(["Okänd plats", String(data.unknownVisits)].join(";"));
    }
    const blob = new Blob([`﻿${rows.join("\n")}`], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `besokare-per-plats-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportToPdf = async () => {
    if (!data) return;
    const { jsPDF } = await import("jspdf");
    const { autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Besökare per plats", 14, 20);
    doc.setFontSize(10);
    doc.text(
      `Senaste ${rangeLabel.toLowerCase()} - ${data.knownVisits} av ${data.totalVisits} besök med känd plats`,
      14,
      28,
    );
    autoTable(doc, {
      startY: 34,
      head: [tab === "countries" ? ["Land", "Besök", "Andel"] : ["Stad", "Land", "Besök"]],
      body:
        tab === "countries"
          ? data.countries.map((c) => [c.name, String(c.visits), `${c.share}%`])
          : data.cities.map((c) => [c.city, c.countryName ?? "-", String(c.visits)]),
      styles: { fontSize: 9 },
      theme: "grid",
    });
    doc.save(`besokare-per-plats-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const renderBody = () => {
    if (loading && !data) {
      return (
        <div className="space-y-6 py-1">
          {[0, 1, 2].map((key) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-12" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      );
    }

    if (error) {
      return <p className="py-8 text-center text-sm text-destructive">{error}</p>;
    }

    if (!data || data.totalVisits === 0) {
      return (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Inga besök de senaste {rangeLabel.toLowerCase()}
        </p>
      );
    }

    /**
     * Said plainly when it applies, because it will apply at first: location
     * is resolved when a visit is recorded and no IP is kept, so every visit
     * from before this was switched on is unplaceable and always will be.
     */
    const unknownNote =
      data.unknownVisits > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {data.unknownVisits.toLocaleString("sv-SE")} av{" "}
            {data.totalVisits.toLocaleString("sv-SE")} besök saknar plats. Platsen hämtas när
            besöket sker, så äldre besök kan inte placeras i efterhand.
          </span>
        </div>
      ) : null;

    if (tab === "cities") {
      if (data.cities.length === 0) {
        return (
          <div className="space-y-4">
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ingen stad kunde fastställas ännu
            </p>
            {unknownNote}
          </div>
        );
      }
      const top = data.cities[0]?.visits ?? 1;
      return (
        <div className="space-y-4">
          <div className="space-y-3">
            {data.cities.map((c) => (
              <div key={`${c.city}-${c.countryCode ?? ""}`} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    <span aria-hidden className="mr-1.5">
                      {c.flag}
                    </span>
                    {c.city}
                    {c.countryName ? (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {c.countryName}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {c.visits.toLocaleString("sv-SE")}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/70 transition-all"
                    style={{ width: `${Math.max(3, (c.visits / top) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {unknownNote}
        </div>
      );
    }

    if (data.countries.length === 0) {
      return (
        <div className="space-y-4">
          <p className="py-6 text-center text-sm text-muted-foreground">
            Ingen plats kunde fastställas ännu
          </p>
          {unknownNote}
        </div>
      );
    }

    const shown = expanded ? data.countries : data.countries.slice(0, COLLAPSED_COUNT);
    return (
      <div className="space-y-4">
        <div className="space-y-4">
          {shown.map((c) => (
            <div key={c.code} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <span aria-hidden className="text-base leading-none">
                    {c.flag}
                  </span>
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                  {c.visits.toLocaleString("sv-SE")} besök
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground transition-all"
                    style={{ width: `${Math.max(2, c.share)}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums">
                  {c.share}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {data.countries.length > COLLAPSED_COUNT ? (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Visa färre" : `Visa alla ${data.countries.length} länder`}
          </Button>
        ) : null}

        {unknownNote}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Besökare per plats</h1>
          <p className="text-sm text-muted-foreground">
            {data
              ? `${data.knownVisits.toLocaleString("sv-SE")} av ${data.totalVisits.toLocaleString("sv-SE")} besök senaste ${rangeLabel.toLowerCase()}`
              : `Senaste ${rangeLabel.toLowerCase()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {rangeLabel}
                <ChevronDown className="ml-2 size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {RANGES.map((r) => (
                <DropdownMenuItem key={r.days} onClick={() => setDays(r.days)}>
                  {r.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load(days)}
            disabled={loading}
            aria-label="Uppdatera"
          >
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!data || data.totalVisits === 0}>
                Exportera
                <ChevronDown className="ml-2 size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportToExcel}>
                <FileSpreadsheet className="mr-2 size-4" />
                Excel (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportToPdf()}>
                <FileText className="mr-2 size-4" />
                PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
        {(
          [
            ["countries", "Länder"],
            ["cities", "Städer"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              tab === key
                ? "rounded-md bg-background px-3 py-1 font-medium shadow-sm"
                : "rounded-md px-3 py-1 text-muted-foreground hover:text-foreground"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {renderBody()}
    </div>
  );
}
