"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { DataTable } from "../payments/data-table";
import { createRefundColumns } from "./columns";
import { DashboardDataTableSkeleton } from "@/components/dashboard-skeletons";
import { RefreshCw } from "lucide-react";
import { formatAmount, normalizeCurrency } from "@repo/currency";

export type RefundRow = {
  id: string;
  refundId: number;
  orderId: number;
  orderNumber: string;
  customerName: string;
  email: string;
  amount: number;
  orderTotal: number | null;
  currency: string;
  chargeKind: string;
  status: string;
  orderStatus: string;
  note: string | null;
  failureReason: string | null;
  stripeRefundId: string | null;
  performedBy: string | null;
  emailSent: boolean;
  createdAt: string | null;
};

const RefundsPage = () => {
  const [data, setData] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRefunds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/refunds", { cache: "no-store" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload?.error ?? "Kunde inte hämta återbetalningar");
        setData([]);
        return;
      }
      setData(await res.json());
    } catch {
      setError("Kunde inte hämta återbetalningar");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRefunds();
  }, [fetchRefunds]);

  const columns = useMemo(() => createRefundColumns(), []);

  /**
   * Totalled per currency, never summed across them. An order can be charged
   * in SEK, NOK, DKK or EUR, and one number mixing those would be a fiction.
   * Only succeeded refunds count — pending money has not moved yet.
   */
  const totals = useMemo(() => {
    const byCurrency = new Map<string, number>();
    for (const r of data) {
      if (r.status !== "succeeded") continue;
      byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + r.amount);
    }
    return [...byCurrency.entries()];
  }, [data]);

  const pending = data.filter((r) => r.status === "pending").length;
  const failed = data.filter((r) => r.status === "failed").length;

  return (
    <div className="space-y-6">
      <div className="mb-8 px-4 py-2 bg-secondary rounded-md flex items-center justify-between">
        <div>
          <h1 className="font-semibold">Återbetalningar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Alla återbetalningar som gjorts från adminpanelen
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchRefunds} disabled={loading}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {!loading && !error && data.length > 0 && (
        <div className="flex flex-wrap items-center gap-6 px-4">
          <div>
            <p className="text-xs text-muted-foreground">Totalt återbetalat</p>
            <p className="text-lg font-semibold">
              {totals.length === 0
                ? "—"
                : totals
                    .map(([currency, sum]) =>
                      formatAmount(sum, normalizeCurrency(currency)),
                    )
                    .join(" · ")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Antal</p>
            <p className="text-lg font-semibold">{data.length}</p>
          </div>
          {/* Surfaced up here because a stuck or failed refund is the thing
              someone needs to notice, not hunt for down the table. */}
          {pending > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Väntar</p>
              <p className="text-lg font-semibold text-amber-600">{pending}</p>
            </div>
          )}
          {failed > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Misslyckade</p>
              <p className="text-lg font-semibold text-destructive">{failed}</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mx-4 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {loading ? (
        <DashboardDataTableSkeleton filterChips={0} columns={7} rows={8} />
      ) : data.length === 0 && !error ? (
        <div className="mx-4 rounded-md border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Inga återbetalningar har gjorts ännu.
          </p>
        </div>
      ) : (
        <DataTable columns={columns} data={data} />
      )}
    </div>
  );
};

export default RefundsPage;
