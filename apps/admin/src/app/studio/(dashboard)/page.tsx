import { db } from "@repo/database";
import { orders, users } from "@repo/database/schema";
import { desc, sql } from "drizzle-orm";
import AppAreaChart from "@/components/AppAreaChart";
import AppBarChart from "@/components/AppBarChart";
import AppPieChart from "@/components/AppPieChart";
import { CustomerReviews } from "@/components/CustomerReviews";
import { OrdersAndProductsTabs } from "@/components/OrdersAndProductsTabs";
import { SalesByLocation } from "@/components/SalesByLocation";
import { SectionCards, type DashboardStats } from "@/components/SectionCards";
import type { OrderRow } from "@/components/RecentOrders";

async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const [revenue, userStats] = await Promise.all([
      db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE) AND status != 'cancelled' THEN total::numeric ELSE 0 END), 0) AS this_month,
          COALESCE(SUM(CASE WHEN date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND status != 'cancelled' THEN total::numeric ELSE 0 END), 0) AS last_month
        FROM orders
      `),
      db.execute(sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE))::int AS new_this_month,
          COUNT(*) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month'))::int AS new_last_month
        FROM "user"
      `),
    ]);

    const revRows = Array.isArray(revenue) ? revenue : (revenue as { rows?: unknown[] }).rows ?? [];
    const userRows = Array.isArray(userStats) ? userStats : (userStats as { rows?: unknown[] }).rows ?? [];
    const rev = (revRows[0] ?? {}) as { this_month: string; last_month: string };
    const u = (userRows[0] ?? {}) as { total: number; new_this_month: number; new_last_month: number };

    const revenueThisMonth = Number(rev.this_month ?? 0);
    const revenueLastMonth = Number(rev.last_month ?? 0);
    const totalUsers = u.total ?? 0;
    const newUsersThisMonth = u.new_this_month ?? 0;
    const newUsersLastMonth = u.new_last_month ?? 0;

    const revenueChange =
      revenueLastMonth > 0
        ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
        : revenueThisMonth > 0
          ? 100
          : 0;

    const newUsersChange =
      newUsersLastMonth > 0
        ? ((newUsersThisMonth - newUsersLastMonth) / newUsersLastMonth) * 100
        : newUsersThisMonth > 0
          ? 100
          : 0;

    const usersChange =
      newUsersLastMonth > 0
        ? newUsersChange
        : newUsersThisMonth > 0
          ? 100
          : 0;

    return {
      revenue: {
        thisMonth: Math.round(revenueThisMonth),
        change: Math.round(revenueChange * 10) / 10,
      },
      newCustomers: {
        count: newUsersThisMonth,
        change: Math.round(newUsersChange * 10) / 10,
      },
      totalUsers: {
        count: totalUsers,
        change: Math.round(usersChange * 10) / 10,
      },
      growthRate: Math.round(revenueChange * 10) / 10,
    };
  } catch {
    return {
      revenue: { thisMonth: 0, change: 0 },
      newCustomers: { count: 0, change: 0 },
      totalUsers: { count: 0, change: 0 },
      growthRate: 0,
    };
  }
}

async function getRecentOrders(): Promise<OrderRow[]> {
  try {
    const rows = await db.query.orders.findMany({
      orderBy: [desc(orders.createdAt)],
      limit: 20,
      with: { items: { columns: { productName: true, productImage: true } } },
    });
    const statusMap: Record<string, "pending" | "processing" | "shipped" | "success" | "failed"> = {
      confirmed: "processing",
      shipped: "shipped",
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
  const [recentOrders, firstUserId, stats] = await Promise.all([
    getRecentOrders(),
    getFirstUserId(),
    getDashboardStats(),
  ]);
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <SectionCards stats={stats} />
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
