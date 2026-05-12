import { db } from "@repo/database";
import { orders, orderItems, users } from "@repo/database/schema";
import { desc, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

function getFullNameFromUser(u: { name: string | null; metadata?: unknown } | null): string | null {
  if (!u) return null;
  const meta = u.metadata as { savedAddress?: Record<string, unknown> } | null | undefined;
  const saved = meta?.savedAddress;
  if (saved && typeof saved === "object") {
    const first = (saved.firstName ?? saved.first_name) as string | undefined;
    const last = (saved.lastName ?? saved.last_name) as string | undefined;
    if (first != null || last != null) {
      const full = [first ?? "", last ?? ""].filter(Boolean).join(" ").trim();
      if (full) return full;
    }
  }
  return u.name ?? null;
}

/** GET /api/orders - List orders for payments table */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  try {
    const orderRows = await db
      .select()
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(200);

    if (orderRows.length === 0) {
      return NextResponse.json([]);
    }

    const userIds = [...new Set(orderRows.map((o) => o.userId).filter(Boolean))] as string[];
    const userRows = userIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, userIds))
      : [];
    const userByid = new Map(userRows.map((u) => [u.id, u]));

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
      let fullName = `${o.firstName} ${o.lastName}`.trim();
      if (o.userId) {
        const userFull = getFullNameFromUser(userByid.get(o.userId) ?? null);
        if (userFull?.trim()) fullName = userFull.trim();
      }
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
): "pending" | "processing" | "success" | "shipped" | "delivered" | "failed" {
  switch (status) {
    case "confirmed":
      return "processing";
    case "shipped":
      return "shipped";
    case "delivered":
      return "delivered";
    case "cancelled":
      return "failed";
    default:
      return "processing";
  }
}
