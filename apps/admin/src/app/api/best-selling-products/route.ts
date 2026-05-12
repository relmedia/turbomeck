import { db } from "@repo/database";
import { orderItems, orders, products } from "@repo/database/schema";
import { sql, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

/** GET /api/best-selling-products - Aggregated product sales from order_items (excludes cancelled) */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  try {
    const rows = await db
      .select({
        id: orderItems.productId,
        name: sql<string>`COALESCE(${products.name}, ${orderItems.productName})`,
        image: sql<string | null>`COALESCE(${products.image}, ${orderItems.productImage})`,
        sold: sql<string>`COALESCE(SUM((${orderItems.price})::numeric * ${orderItems.quantity}), 0)`,
        sales: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(ne(orders.status, "cancelled"))
      .groupBy(orderItems.productId, orderItems.productName, orderItems.productImage, products.name, products.image);

    const list = rows.map((r) => ({
      id: r.id ?? 0,
      name: r.name ?? "—",
      image: r.image ?? null,
      sold: parseFloat(r.sold ?? "0"),
      sales: parseInt(r.sales ?? "0", 10),
    }));

    // Sort by revenue (sold) descending
    list.sort((a, b) => b.sold - a.sold);

    return NextResponse.json(list);
  } catch (err) {
    console.error("Failed to fetch best-selling products:", err);
    return NextResponse.json(
      { error: "Kunde inte hämta bäst säljande produkter" },
      { status: 500 }
    );
  }
}
