"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Payment, createColumns } from "./columns";
import { DataTable } from "./data-table";
import { Button } from "@repo/ui/components/button";
import { Plus } from "lucide-react";
import { toast } from "react-toastify";

type StatusTab = "all" | "completed" | "processed" | "returned" | "canceled";

const PaymentsPage = () => {
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [data, setData] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orders");
      const list = res.ok ? await res.json() : [];
      setData(list);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Kunde inte ta bort");
      }
      toast.success("Order borttagen");
      await fetchOrders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte ta bort");
      throw err;
    }
  }, [fetchOrders]);

  const handleBulkDelete = useCallback(
    async (ids: string[]) => {
      let removed = 0;
      let failed = 0;
      for (const id of ids) {
        try {
          const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
          if (!res.ok) {
            failed++;
          } else {
            removed++;
          }
        } catch {
          failed++;
        }
      }
      if (removed > 0) {
        toast.success(
          removed === 1 ? "Order borttagen" : `${removed} ordrar borttagna`,
        );
      }
      if (failed > 0) {
        toast.error(
          failed === 1
            ? "En order kunde inte tas bort"
            : `${failed} ordrar kunde inte tas bort`,
        );
      }
      await fetchOrders();
    },
    [fetchOrders],
  );

  const columns = useMemo(() => createColumns(handleDelete), [handleDelete]);

  const filteredData = data.filter((row) => {
    if (statusTab === "all") return true;
    if (statusTab === "completed")
      return ["success", "shipped", "delivered"].includes(row.status);
    if (statusTab === "processed")
      return ["success", "shipped", "delivered"].includes(row.status);
    if (statusTab === "returned") return row.type === "return";
    if (statusTab === "canceled") return row.status === "failed";
    return true;
  });

  const tabs: { value: StatusTab; label: string }[] = [
    { value: "all", label: "Alla" },
    { value: "completed", label: "Slutförda" },
    { value: "processed", label: "Behandlade" },
    { value: "returned", label: "Returer" },
    { value: "canceled", label: "Avbrutna" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Ordrar</h1>
          <Button size="sm" className="bg-foreground text-background hover:bg-foreground/90">
            <Plus className="w-4 h-4 mr-2" />
            Skapa order
          </Button>
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-muted/50 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusTab(tab.value)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                statusTab === tab.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="rounded-md border bg-card p-8 text-center text-muted-foreground">
          Laddar ordrar...
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filteredData}
          onBulkDelete={handleBulkDelete}
        />
      )}
    </div>
  );
};

export default PaymentsPage;
