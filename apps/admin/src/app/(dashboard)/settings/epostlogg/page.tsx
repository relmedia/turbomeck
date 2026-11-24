"use client";

/**
 * E-postlogg — which order emails actually went out.
 *
 * Answers the question that used to mean opening one order at a time: "did the
 * Klar att hämta mail go out, and has anything failed?"
 *
 * Read-only. The data is the send-exactly-once ledger behind the automated
 * mail, already written on every send; this page only reads it. Resending
 * stays on the order page, where it is behind the ledger's claim — offering it
 * from a log would mail a real customer from a screen meant for reading.
 *
 * ## Why a plain table and not the shared DataTable
 *
 * `payments/data-table.tsx` is imported across folders by /refunds and
 * /shipping, so it was the obvious choice — but its toolbar hard-codes a
 * "Sök ordrar..." box and two dead dropdowns ("Status", and "Typ:
 * Försäljning / Retur") whose items are decorative `preventDefault` stubs.
 * On an email log those read as controls that are broken rather than absent.
 * So this renders the `@repo/ui` table primitives directly, the way
 * `settings/design` renders its own list, and the filters below are real.
 *
 * Everything is filtered client-side over one fetch, matching the rest of the
 * dashboard. The endpoint returns the newest 500 rows and the table grows
 * about eight rows per order; if that ever stops being enough, the filter
 * state here maps onto query parameters without reshaping the page.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Inbox } from "lucide-react";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import {
  ORDER_EMAIL_KINDS,
  ORDER_EMAIL_LABELS,
  ORDER_EMAIL_ORIGIN_LABELS,
  ORDER_EMAIL_STATE_META,
  type OrderEmailState,
} from "@/lib/order-email-state";

type EmailLogRow = {
  id: string;
  orderId: number;
  orderNumber: string | null;
  customerName: string | null;
  customerEmail: string | null;
  kind: string;
  label: string;
  state: OrderEmailState;
  origin: string;
  at: string;
  recipient: string | null;
  error: string | null;
  observedStatus: string | null;
};

/** Problem states first — those are what someone opens this page to find. */
const STATE_FILTERS: OrderEmailState[] = [
  "failed",
  "stale",
  "sending",
  "sent",
  "superseded",
  "backfilled",
];

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Why a row is in the state it is, when that is worth saying. */
function detailFor(row: EmailLogRow): string {
  if (row.error) return row.error;
  if (row.state === "superseded") {
    return row.observedStatus
      ? `Hoppades över — paketet var redan ${row.observedStatus}`
      : "Hoppades över — behövdes inte längre";
  }
  if (row.state === "backfilled") return "Fanns före loggen — inget utskick registrerat";
  return "—";
}

export default function EmailLogPage() {
  const [rows, setRows] = useState<EmailLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failedToLoad, setFailedToLoad] = useState(false);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [state, setState] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/order-emails", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { emails?: EmailLogRow[] };
        if (!cancelled) setRows(json.emails ?? []);
      } catch {
        if (!cancelled) setFailedToLoad(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (state !== "all" && r.state !== state) return false;
      if (!q) return true;
      return [r.orderNumber, r.recipient, r.customerEmail, r.customerName, r.label]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, search, kind, state]);

  /** Only kinds actually present, so the filter cannot offer an empty result. */
  const kindsPresent = useMemo(() => {
    const seen = new Set(rows.map((r) => r.kind));
    const known = ORDER_EMAIL_KINDS.filter((k) => seen.has(k));
    /** A kind added after this list was written still filters. */
    const unknown = [...seen].filter((k) => !ORDER_EMAIL_KINDS.includes(k as never));
    return [...known, ...unknown];
  }, [rows]);

  const counts = useMemo(() => {
    const by = (s: OrderEmailState) => rows.filter((r) => r.state === s).length;
    return { failed: by("failed"), stale: by("stale"), superseded: by("superseded") };
  }, [rows]);

  return (
    <section className="rounded-xl border bg-card p-4 md:p-6">
      <div className="mb-4 max-w-3xl">
        <h2 className="text-lg font-semibold">E-postlogg</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Varje automatiskt orderutskick som registrerats, senast först. Klicka på
          ordernumret för att öppna ordern.
        </p>
      </div>

      {/*
        The two things the data cannot say for itself. Without them the page
        misleads: a missing Orderbekräftelse reads as "kunden fick inget", and
        "Skickad" reads as "framkommet". This is the page's honesty, not a
        decoration — it stays even when the table is empty.
      */}
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
        <strong>Loggen visar inte allt.</strong> Orderbekräftelsen som går ut
        automatiskt vid köp registreras inte här — bara bekräftelser som någon
        skickat om manuellt. Att en order saknar rad för orderbekräftelse betyder
        alltså <strong>inte</strong> att kunden blev utan. Utskick du stängt av under{" "}
        <Link href="/settings/kundutskick" className="underline">
          Automatiska kundutskick
        </Link>{" "}
        lämnar inget spår alls. <strong>Skickad</strong> betyder att mejlservern tog
        emot utskicket — inte att det bevisligen nådde inkorgen. Studsar registreras
        inte.
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Sök order, mottagare eller kund…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full sm:w-[280px]"
        />
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="h-9 w-[210px]">
            <SelectValue placeholder="Utskick" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Utskick: alla</SelectItem>
            {kindsPresent.map((k) => (
              <SelectItem key={k} value={k}>
                {k === "order_confirmation"
                  ? "Orderbekräftelse (endast omskick)"
                  : (ORDER_EMAIL_LABELS[k] ?? k)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="h-9 w-[210px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Status: alla</SelectItem>
            {STATE_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {ORDER_EMAIL_STATE_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length === rows.length
            ? `${rows.length} rader`
            : `${filtered.length} av ${rows.length}`}
          {counts.failed > 0 && (
            <span className="ml-2 text-destructive">{counts.failed} misslyckade</span>
          )}
          {counts.stale > 0 && (
            <span className="ml-2 text-amber-700">{counts.stale} avbrutna</span>
          )}
        </span>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[170px]">Tidpunkt</TableHead>
              <TableHead className="w-[190px]">Utskick</TableHead>
              <TableHead className="w-[130px]">Order</TableHead>
              <TableHead>Mottagare</TableHead>
              <TableHead className="w-[180px]">Status</TableHead>
              <TableHead className="w-[110px]">Källa</TableHead>
              <TableHead>Detalj</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                  Hämtar utskick…
                </TableCell>
              </TableRow>
            ) : failedToLoad ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm text-destructive">
                  Kunde inte hämta utskicksloggen. Ladda om sidan för att försöka igen.
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <Inbox className="mx-auto mb-2 size-5 text-muted-foreground/50" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    {rows.length === 0
                      ? "Inga utskick har registrerats än."
                      : "Inga rader matchar filtren. Loggen innehåller bara det automatiken bockat av — se noten ovan."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const meta = ORDER_EMAIL_STATE_META[r.state];
                const to = r.recipient || r.customerEmail;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDateTime(r.at)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{r.label}</TableCell>
                    <TableCell>
                      <Link
                        href={`/payments/${r.orderId}`}
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                      >
                        {r.orderNumber ?? `#${r.orderId}`}
                        <ExternalLink className="size-3" aria-hidden />
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <div className="truncate text-sm" title={to ?? undefined}>
                        {to ?? "—"}
                      </div>
                      {r.customerName && (
                        <div className="truncate text-xs text-muted-foreground">
                          {r.customerName}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}
                        title={meta.hint}
                      >
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ORDER_EMAIL_ORIGIN_LABELS[r.origin] ?? r.origin}
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <div
                        className={`truncate text-xs ${
                          r.error ? "text-destructive" : "text-muted-foreground"
                        }`}
                        title={detailFor(r)}
                      >
                        {detailFor(r)}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
