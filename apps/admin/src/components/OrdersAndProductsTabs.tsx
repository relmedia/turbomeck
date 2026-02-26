"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { RecentOrders } from "@/components/RecentOrders";
import { BestSellingProducts } from "@/components/BestSellingProducts";
import { cn } from "@/lib/utils";
import type { OrderRow } from "@/components/RecentOrders";

type OrdersAndProductsTabsProps = {
  recentOrders?: OrderRow[];
  firstUserId?: string | null;
};

export function OrdersAndProductsTabs({ recentOrders = [], firstUserId = null }: OrdersAndProductsTabsProps) {
  const [activeTab, setActiveTab] = useState<"orders" | "products">("orders");
  const [toolbar, setToolbar] = useState<ReactNode>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex rounded-lg bg-muted p-1 gap-0.5">
        <button
          type="button"
          onClick={() => setActiveTab("orders")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
            activeTab === "orders"
              ? "bg-background text-foreground font-semibold shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Senaste ordrar
          <span
            className={cn(
              "ml-2 inline-flex size-5 min-w-5 items-center justify-center rounded-full text-[10px] font-medium",
              activeTab === "orders"
                ? "bg-muted text-foreground"
                : "bg-muted-foreground/20 text-muted-foreground"
            )}
          >
            8
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("products")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
            activeTab === "products"
              ? "bg-background text-foreground font-semibold shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Bäst säljande produkter
          <span
            className={cn(
              "ml-2 inline-flex size-5 min-w-5 items-center justify-center rounded-full text-[10px] font-medium",
              activeTab === "products"
                ? "bg-muted text-foreground"
                : "bg-muted-foreground/20 text-muted-foreground"
            )}
          >
            8
          </span>
        </button>
      </div>
        <div className="flex gap-2 shrink-0">{toolbar}</div>
      </div>
      {activeTab === "orders" && (
        <RecentOrders hideTitle onToolbarRender={setToolbar} orders={recentOrders} firstUserId={firstUserId} />
      )}
      {activeTab === "products" && (
        <BestSellingProducts hideTitle onToolbarRender={setToolbar} />
      )}
    </div>
  );
}
