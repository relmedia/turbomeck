import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { orders, orderItems, users } from "@repo/database/schema";
import { desc, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

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

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Behandlas",
  shipped: "Skickad",
  delivered: "Levererad",
  cancelled: "Avbruten",
};

/** GET /api/shipping - List all orders with full shipping details */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orderRows = await db
      .select()
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(500);

    if (orderRows.length === 0) {
      return NextResponse.json([]);
    }

    const userIds = [...new Set(orderRows.map((o) => o.userId).filter(Boolean))] as string[];
    const userRows = userIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, userIds))
      : [];
    const userById = new Map(userRows.map((u) => [u.id, u]));

    const list = orderRows.map((o) => {
      let fullName = `${o.firstName} ${o.lastName}`.trim();
      if (o.userId) {
        const userFull = getFullNameFromUser(userById.get(o.userId) ?? null);
        if (userFull?.trim()) fullName = userFull.trim();
      }
      return {
        id: String(o.id),
        orderId: o.id,
        orderNumber: o.orderNumber,
        fullName,
        email: o.email,
        phone: o.phone ?? null,
        address: o.address,
        city: o.city,
        postalCode: o.postalCode,
        country: o.country,
        servicePointName: o.servicePointName ?? null,
        servicePointId: o.servicePointId ?? null,
        deliveryOption: o.deliveryOption ?? "servicepoint",
        postNordTrackingId: o.postNordTrackingId ?? null,
        status: o.status ?? "confirmed",
        statusLabel: STATUS_LABELS[o.status ?? ""] ?? "Behandlas",
        createdAt: o.createdAt?.toISOString?.() ?? null,
      };
    });

    return NextResponse.json(list);
  } catch (err) {
    console.error("Failed to fetch shipping data:", err);
    return NextResponse.json(
      { error: "Kunde inte hämta leveransinformation" },
      { status: 500 }
    );
  }
}
