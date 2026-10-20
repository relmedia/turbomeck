"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
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
} from "@repo/ui/components/alert-dialog";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "react-toastify";
import {
  currencyDecimals,
  formatAmount,
  normalizeCurrency,
  type DisplayCurrencyCode,
} from "@repo/currency";

type RefundableCharge = {
  kind: "full" | "deposit" | "balance";
  label: string;
  currency: string;
  amount: number;
  amountRefunded: number;
  pendingLocal: number;
  refundable: number;
  last4: string | null;
  blockedReason: string | null;
};

type RefundRow = {
  id: number;
  chargeKind: string;
  amount: number;
  currency: string;
  status: string;
  note: string | null;
  performedBy: string | null;
  stripeRefundId: string | null;
  stripeFailureReason: string | null;
  emailSentAt: string | null;
  createdAt: string;
};

type RefundQuote = {
  currency: string;
  charges: RefundableCharge[];
  refunds: RefundRow[];
};

/**
 * Parse what a human typed, not what Intl printed.
 *
 * `formatAmount` groups with a non-breaking space (U+00A0) and EUR uses a comma
 * decimal, so round-tripping a formatted string back through `Number()` yields
 * NaN. Strip both space kinds and normalise the decimal mark.
 */
function parseAmountInput(raw: string): number {
  const cleaned = raw.replace(/[\s ]/g, "").replace(",", ".");
  return Number(cleaned);
}

/** Pre-fill value — plain digits, never the formatted string. */
function toInputValue(amount: number, currency: DisplayCurrencyCode): string {
  return currencyDecimals(currency) === 2 ? amount.toFixed(2) : String(Math.round(amount));
}

export default function RefundSection({
  orderId,
  customerEmail,
  onRefunded,
}: {
  orderId: number | string;
  customerEmail: string;
  /** Called after a successful refund so the page can refetch the order. */
  onRefunded: () => void;
}) {
  const [quote, setQuote] = useState<RefundQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<string>("");
  const [amountInput, setAmountInput] = useState("");
  const [note, setNote] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [refunding, setRefunding] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const currency = normalizeCurrency(quote?.currency);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/refundable`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data?.error ?? "Kunde inte hämta återbetalningsinformation");
        setQuote(null);
        return;
      }
      setQuote(data as RefundQuote);
    } catch {
      setLoadError("Kunde inte hämta återbetalningsinformation");
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Select the first charge that still has money on it, once. */
  useEffect(() => {
    if (!quote || kind) return;
    const first = quote.charges.find((c) => c.refundable > 0);
    if (!first) return;
    setKind(first.kind);
    setAmountInput(toInputValue(first.refundable, normalizeCurrency(quote.currency)));
  }, [quote, kind]);

  const selected = quote?.charges.find((c) => c.kind === kind) ?? null;
  const amount = parseAmountInput(amountInput);
  const amountValid =
    selected != null &&
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= selected.refundable + 1e-9;

  const money = (n: number) => formatAmount(n, currency);

  function pickCharge(nextKind: string) {
    setKind(nextKind);
    const charge = quote?.charges.find((c) => c.kind === nextKind);
    if (charge) setAmountInput(toInputValue(charge.refundable, currency));
    // A different charge is a different refund — never reuse the reservation key.
    setRequestId("");
  }

  async function handleRefund() {
    if (!selected || !amountValid) return;
    setRefunding(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: selected.kind,
          amount,
          requestId,
          note: note.trim() || null,
          notifyCustomer,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Kunde inte återbetala");
        return;
      }
      setDialogOpen(false);
      setNote("");
      if (data.deduplicated) {
        toast.info("Återbetalningen var redan genomförd");
      } else {
        toast.success(`Återbetalning genomförd: ${money(data.refund?.amount ?? amount)}`);
      }
      if (data.emailSent === false && data.emailError) {
        toast.warn(`Återbetalningsmejl skickades inte: ${data.emailError}`);
      }
      await load();
      onRefunded();
    } catch {
      toast.error("Kunde inte återbetala");
      // Deliberately keep requestId: a retry must be the same reservation,
      // not a second refund.
    } finally {
      setRefunding(false);
    }
  }

  const refunds = quote?.refunds ?? [];
  const nothingRefundable =
    quote != null && quote.charges.every((c) => c.refundable <= 0);

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="py-2 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-muted-foreground" />
          Återbetalning
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-4">
        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-9 w-full max-w-sm" />
          </div>
        )}

        {/* Stripe being unreachable must not break the rest of the order page. */}
        {!loading && loadError && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void load()}>
              Försök igen
            </Button>
          </div>
        )}

        {!loading && quote && (
          <>
            <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
              {quote.charges.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Ordern har ingen Stripe-betalning att återbetala.
                </p>
              )}
              {quote.charges.map((c) => (
                <div key={c.kind} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs font-medium">
                    {c.label}
                    {c.last4 ? (
                      <span className="ml-1 font-normal text-muted-foreground">
                        · **** {c.last4}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {money(c.amount)}
                    {c.amountRefunded > 0 && <> · återbetalt {money(c.amountRefunded)}</>}
                    {" · kvar "}
                    <span className={c.refundable > 0 ? "font-medium text-foreground" : ""}>
                      {money(c.refundable)}
                    </span>
                  </span>
                  {c.blockedReason && (
                    <span className="w-full text-[11px] text-muted-foreground">
                      {c.blockedReason}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {nothingRefundable ? (
              <p className="text-xs text-muted-foreground">Inget belopp kvar att återbetala.</p>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                {quote.charges.length > 1 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="refund-kind" className="text-xs">
                      Vilken betalning?
                    </Label>
                    <Select value={kind} onValueChange={pickCharge}>
                      <SelectTrigger id="refund-kind" className="h-9 w-[220px]">
                        <SelectValue placeholder="Välj betalning" />
                      </SelectTrigger>
                      <SelectContent>
                        {quote.charges.map((c) => (
                          <SelectItem key={c.kind} value={c.kind} disabled={c.refundable <= 0}>
                            {c.label}
                            {c.refundable > 0 ? ` — ${money(c.refundable)}` : " (inget kvar)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="refund-amount" className="text-xs">
                    Belopp ({currency})
                  </Label>
                  <Input
                    id="refund-amount"
                    inputMode="decimal"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    className="h-9 w-[140px]"
                  />
                  {selected && (
                    <p className="text-[11px] text-muted-foreground">
                      Max {money(selected.refundable)}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="refund-note" className="text-xs">
                    Anledning (intern)
                  </Label>
                  <Input
                    id="refund-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Visas inte för kunden"
                    className="h-9 w-[240px]"
                  />
                </div>

                <label className="flex h-9 items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={notifyCustomer}
                    onChange={(e) => setNotifyCustomer(e.target.checked)}
                    className="h-3.5 w-3.5 accent-foreground"
                  />
                  Meddela kunden
                </label>

                <AlertDialog
                  open={dialogOpen}
                  onOpenChange={(open) => {
                    setDialogOpen(open);
                    // One reservation key per dialog open: a double-click, a
                    // retried fetch and a reload-and-retry all collapse onto
                    // one refund.
                    if (open) setRequestId(crypto.randomUUID());
                  }}
                >
                  <AlertDialogTrigger asChild>
                    <Button size="sm" className="h-9" disabled={!amountValid || refunding}>
                      {refunding ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Återbetalar...
                        </>
                      ) : (
                        "Återbetala"
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Återbetala {money(amount || 0)}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Du återbetalar <strong>{money(amount || 0)}</strong> av{" "}
                        <strong>{selected?.label}</strong> till{" "}
                        <strong>{customerEmail}</strong>.{" "}
                        {notifyCustomer
                          ? "Kunden får ett mejl om återbetalningen."
                          : "Inget mejl skickas till kunden."}{" "}
                        Återbetalningar kan inte ångras.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={refunding}>Avbryt</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.preventDefault();
                          void handleRefund();
                        }}
                        disabled={refunding}
                        className="bg-destructive text-white hover:bg-destructive/90"
                      >
                        {refunding ? "Återbetalar..." : "Återbetala"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            {refunds.length > 0 && (
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Tidigare återbetalningar
                </p>
                {refunds.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-baseline gap-2 text-xs">
                    <span className="font-medium">{money(r.amount)}</span>
                    <span className="text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString("sv-SE", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                    {r.performedBy && (
                      <span className="text-muted-foreground">· {r.performedBy}</span>
                    )}
                    {/* A refund we are unsure about must be loud, not hidden. */}
                    {r.status === "pending" && (
                      <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
                        Väntar — kontrollera i Stripe
                      </span>
                    )}
                    {r.status === "failed" && (
                      <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">
                        Misslyckades{r.stripeFailureReason ? `: ${r.stripeFailureReason}` : ""}
                      </span>
                    )}
                    {r.note && <span className="text-muted-foreground">· {r.note}</span>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
