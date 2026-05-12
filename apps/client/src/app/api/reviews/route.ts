import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { reviews, orders, orderItems, users } from "@repo/database";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSameOrigin } from "@/lib/same-origin";

export async function POST(req: Request) {
  // SECURITY (audit M3): same-origin gate on cookie-auth state change.
  const csrfDenied = requireSameOrigin(req);
  if (csrfDenied) return csrfDenied;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Logga in för att skriva en recension." }, { status: 401 });
  }

  let body: { productId?: number; rating?: number; title?: string; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  const productId = typeof body.productId === "number" ? body.productId : undefined;
  const rating = typeof body.rating === "number" ? body.rating : undefined;
  const title = typeof body.title === "string" ? body.title.trim() || null : null;
  const comment = typeof body.comment === "string" ? body.comment.trim() || null : null;

  if (productId == null || rating == null) {
    return NextResponse.json(
      { error: "productId och rating krävs" },
      { status: 400 }
    );
  }
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return NextResponse.json(
      { error: "Rating måste vara 1–5" },
      { status: 400 }
    );
  }

  try {
    // Check if user has purchased this product (verified purchase)
    const found = await db
      .select({ orderId: orders.id })
      .from(orders)
      .innerJoin(orderItems, and(eq(orderItems.orderId, orders.id), eq(orderItems.productId, productId)))
      .where(eq(orders.userId, session.user!.id!))
      .limit(1);
    const orderId = found[0]?.orderId ?? null;

    const inserted = await db
      .insert(reviews)
      .values({
        productId,
        userId: session.user!.id!,
        orderId,
        rating,
        title,
        comment,
      })
      .returning();

    const r = inserted[0]!;
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, r.userId)).limit(1);

    return NextResponse.json({
      success: true,
      review: {
        id: r.id,
        productId: r.productId,
        userId: r.userId,
        orderId: r.orderId,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        createdAt: r.createdAt,
        userName: u?.name ?? "Anonym",
        verifiedPurchase: orderId != null,
      },
      verifiedPurchase: orderId != null,
    });
  } catch (err) {
    const e = err as { code?: string; constraint?: string };
    if (e.code === "23505" || e.constraint?.includes("product_id") || e.constraint?.includes("user_id")) {
      return NextResponse.json(
        { error: "Du har redan skrivit en recension för denna produkt. Du kan endast skriva en recension per produkt." },
        { status: 409 }
      );
    }
    console.error("Failed to create review:", err);
    return NextResponse.json({ error: "Kunde inte spara recensionen." }, { status: 500 });
  }
}
