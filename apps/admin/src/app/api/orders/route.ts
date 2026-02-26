import { db } from "@repo/database";
import { orders, orderItems } from "@repo/database/schema";
import { desc, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

/** GET /api/orders - List orders for payments table */
export async function GET() {
  try {
    const orderRows = await db
      .select()
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(200);

    if (orderRows.length === 0) {
      return NextResponse.json([]);
    }

    const orderIds = orderRows.map((o) => o.id);
    const items = await db
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds));

    const firstItemByOrderId = new Map<number, (typeof items)[0]>();
    for (const item of items) {
      if (!firstItemByOrderId.has(item.orderId)) {
        firstItemByOrderId.set(item.orderId, item);
      }
    }

    const list = orderRows.map((o) => {
      const firstItem = firstItemByOrderId.get(o.id);
      const fullName = `${o.firstName} ${o.lastName}`.trim();
      return {
        id: String(o.id),
        orderId: o.id,
        amount: Number(o.total),
        fullName,
        userId: o.userId ?? "",
        email: o.email,
        status: mapOrderStatus(o.status),
        productName: firstItem?.productName,
        productImage: firstItem?.productImage,
        date: o.createdAt?.toISOString?.()?.slice(0, 10),
        type: "sale" as const,
      };
    });
    return NextResponse.json(list);
  } catch (err) {
    console.error("Failed to fetch orders:", err);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

function mapOrderStatus(
  status: string | null
): "pending" | "success" | "shipped" | "delivered" | "failed" {
  switch (status) {
    case "confirmed":
      return "pending";
    case "shipped":
      return "shipped";
    case "delivered":
      return "delivered";
    case "cancelled":
      return "failed";
    default:
      return "pending";
  }
}
