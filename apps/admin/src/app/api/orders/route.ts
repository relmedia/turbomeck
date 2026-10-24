import { db } from "@repo/database";
import { orders, orderItems, users } from "@repo/database/schema";
import { desc, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { PRODUCT_API } from "@/lib/product-api";
import { internalProductApiAuthHeaders } from "@/lib/internal-product-api";
import { internalAdminAuthHeaders } from "@/lib/internal-admin-api";

/**
 * What the "Lägg till Order" modal may send.
 *
 * Prices are deliberately absent: product-service re-prices from the product
 * ids, so a tampered or stale price in the browser cannot set what an order
 * costs. Quantity is capped to keep an accidental extra digit from booking a
 * parcel nobody can lift.
 */
const manualOrderSchema = z.object({
  email: z.string().trim().email("Ogiltig e-postadress"),
  firstName: z.string().trim().min(1, "Förnamn krävs"),
  lastName: z.string().trim().min(1, "Efternamn krävs"),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().min(1, "Adress krävs"),
  postalCode: z.string().trim().min(1, "Postnummer krävs"),
  city: z.string().trim().min(1, "Ort krävs"),
  country: z.string().trim().length(2).default("SE"),
  /**
   * Booking only supports collection at a service point
   * (postnord-book-shipment/route.ts), so an order created to test booking
   * needs one. Home delivery is still allowed here — it just cannot be booked.
   */
  deliveryOption: z.enum(["servicepoint", "home"]).default("servicepoint"),
  servicePointId: z.string().trim().max(120).optional(),
  servicePointName: z.string().trim().max(200).optional(),
  /**
   * The point's own address. Required by PostNord's EDI booking and
   * unrecoverable afterwards (every by-id lookup is 410 Gone), so it is
   * captured here at the moment of choosing.
   */
  servicePointStreet: z.string().trim().max(200).optional(),
  servicePointPostalCode: z.string().trim().max(20).optional(),
  servicePointCity: z.string().trim().max(120).optional(),
  servicePointCountryCode: z.string().trim().length(2).optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(99),
        variant: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, "Minst en produkt krävs"),
});

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
        /**
         * Backs the "Returer" tab, which filtered on this field while the API
         * hard-coded every row as a sale, so the tab was permanently empty.
         */
        type:
          o.status === "refunded" || o.status === "partially_refunded"
            ? ("return" as const)
            : ("sale" as const),
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
):
  | "pending"
  | "processing"
  | "success"
  | "shipped"
  | "delivered"
  | "failed"
  | "partially_refunded"
  | "refunded" {
  switch (status) {
    case "confirmed":
      return "processing";
    case "shipped":
      return "shipped";
    case "delivered":
      return "delivered";
    case "cancelled":
      return "failed";
    case "partially_refunded":
      return "partially_refunded";
    case "refunded":
      return "refunded";
    default:
      return "processing";
  }
}

/**
 * POST /api/orders — create an order by hand from admin.
 *
 * Exists so staff can produce a real order without buying something in the
 * shop, chiefly to exercise PostNord booking end to end.
 *
 * Deliberately a thin proxy. product-service owns order numbering, pricing,
 * the view token and the insert, and it is the only place that knows how to
 * build an order that behaves like every other one. Writing to the tables
 * directly from here would be a second implementation of that, and it would
 * drift the first time pricing changed.
 */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let parsed: z.infer<typeof manualOrderSchema>;
  try {
    parsed = manualOrderSchema.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "Ogiltig begäran";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const res = await fetch(`${PRODUCT_API}/orders/manual`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...internalProductApiAuthHeaders(),
        ...internalAdminAuthHeaders(),
      },
      body: JSON.stringify(parsed),
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) {
      let message = `Kunde inte skapa order (HTTP ${res.status}).`;
      try {
        const body = JSON.parse(text) as { error?: unknown };
        if (typeof body.error === "string" && body.error.trim()) message = body.error;
      } catch {
        /* keep the generic message */
      }
      console.error("[admin] manual order failed", res.status, text.slice(0, 500));
      return NextResponse.json({ error: message }, { status: res.status });
    }

    return NextResponse.json(JSON.parse(text), { status: 201 });
  } catch (err) {
    console.error("[admin] manual order error", err);
    const message =
      err instanceof Error && err.message.includes("INTERNAL_ADMIN_API_SECRET")
        ? "INTERNAL_ADMIN_API_SECRET saknas i admin-miljön."
        : "Kunde inte nå produkttjänsten.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
