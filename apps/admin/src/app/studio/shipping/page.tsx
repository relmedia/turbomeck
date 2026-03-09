"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable } from "../payments/data-table";
import { createShippingColumns } from "./columns";
import { RefreshCw } from "lucide-react";

export type ShippingRow = {
  id: string;
  orderId: number;
  orderNumber: string;
  fullName: string;
  email: string;
  phone: string | null;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  servicePointName: string | null;
  servicePointId: string | null;
  deliveryOption: string;
  postNordTrackingId: string | null;
  status: string;
  statusLabel: string;
  createdAt: string | null;
};

const ShippingPage = () => {
  const [data, setData] = useState<ShippingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchShipping = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shipping");
      const list = res.ok ? await res.json() : [];
      setData(list);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShipping();
  }, [fetchShipping]);

  const columns = createShippingColumns();

  return (
    <div className="space-y-6">
      <div className="mb-8 px-4 py-2 bg-secondary rounded-md flex items-center justify-between">
        <div>
          <h1 className="font-semibold">Leveransdetaljer</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Alla kunders leveransadresser och spårningsinfo
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchShipping}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {loading ? (
        <div className="rounded-md border bg-card p-8 text-center text-muted-foreground">
          Laddar leveransinformation...
        </div>
      ) : (
        <DataTable columns={columns} data={data} />
      )}
    </div>
  );
};

export default ShippingPage;
