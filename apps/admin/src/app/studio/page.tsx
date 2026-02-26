import { db } from "@repo/database";
import { orders, users } from "@repo/database/schema";
import { desc } from "drizzle-orm";
import AppAreaChart from "@/components/AppAreaChart";
import AppBarChart from "@/components/AppBarChart";
import AppPieChart from "@/components/AppPieChart";
import { CustomerReviews } from "@/components/CustomerReviews";
import { OrdersAndProductsTabs } from "@/components/OrdersAndProductsTabs";
import { SalesByLocation } from "@/components/SalesByLocation";
import { SectionCards } from "@/components/SectionCards";
import type { OrderRow } from "@/components/RecentOrders";

async function getRecentOrders(): Promise<OrderRow[]> {
  try {
    const rows = await db.query.orders.findMany({
      orderBy: [desc(orders.createdAt)],
      limit: 20,
      with: { items: { columns: { productName: true, productImage: true } } },
    });
    const statusMap: Record<string, "pending" | "processing" | "success" | "failed"> = {
      confirmed: "processing",
      shipped: "processing",
      delivered: "success",
      cancelled: "failed",
    };
    return rows.map((o) => ({
      id: String(o.id),
      orderId: o.id,
      userId: o.userId ?? null,
      fullName: `${o.firstName} ${o.lastName}`.trim(),
      productName: o.items?.[0]?.productName ?? "Order",
      amount: Number(o.total),
      status: statusMap[o.status] ?? "processing",
      productImage: o.items?.[0]?.productImage ?? null,
    }));
  } catch {
    return [];
  }
}

async function getFirstUserId(): Promise<string | null> {
  try {
    const [u] = await db.select({ id: users.id }).from(users).limit(1);
    return u?.id ?? null;
  } catch {
    return null;
  }
}

const Homepage = async () => {
  const [recentOrders, firstUserId] = await Promise.all([
    getRecentOrders(),
    getFirstUserId(),
  ]);
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <SectionCards />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-6">
        <div className="rounded-xl border bg-card p-4 lg:col-span-2 2xl:col-span-3">
          <AppBarChart />
        </div>
        <div className="rounded-xl border bg-card p-4 lg:col-span-2 2xl:col-span-3">
          <AppAreaChart />
        </div>
        <div className="rounded-xl border bg-card p-4 lg:col-span-2 2xl:col-span-2">
          <SalesByLocation />
        </div>
        <div className="rounded-xl border bg-card p-4 2xl:col-span-2">
          <AppPieChart />
        </div>
        <div className="rounded-xl border bg-card p-4 lg:col-span-2 2xl:col-span-2">
          <CustomerReviews />
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <OrdersAndProductsTabs recentOrders={recentOrders} firstUserId={firstUserId} />
      </div>
    </div>
  );
};

export default Homepage;
