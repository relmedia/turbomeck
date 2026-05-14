"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { DataTable } from "../payments/data-table";
import { createShippingColumns } from "./columns";
import { DashboardDataTableSkeleton } from "@/components/dashboard-skeletons";
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
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
      {loading ? (
        <DashboardDataTableSkeleton filterChips={3} columns={7} rows={8} />
      ) : (
        <DataTable columns={columns} data={data} />
      )}
    </div>
  );
};

export default ShippingPage;
