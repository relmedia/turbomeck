import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { reviews, orders, orderItems } from "@repo/database";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Can the signed-in user review this product? The product page shows the review
 * form only for verified buyers, so it needs to know (a) whether this account has
 * an order containing the product and (b) whether it already reviewed it — one
 * review per user and product is enforced by a unique constraint on insert.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const productId = Number(new URL(req.url).searchParams.get("productId"));
  if (!Number.isInteger(productId) || productId < 1) {
    return NextResponse.json({ error: "Ogiltigt produkt-id" }, { status: 400 });
  }

  const userId = session.user.id;

  try {
    const purchased = await db
      .select({ orderId: orders.id })
      .from(orders)
      .innerJoin(
        orderItems,
        and(eq(orderItems.orderId, orders.id), eq(orderItems.productId, productId))
      )
      .where(eq(orders.userId, userId))
      .limit(1);

    const existing = await db
      .select({
        id: reviews.id,
        productId: reviews.productId,
        rating: reviews.rating,
        title: reviews.title,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
        editedAt: reviews.editedAt,
      })
      .from(reviews)
      .where(and(eq(reviews.productId, productId), eq(reviews.userId, userId)))
      .limit(1);

    return NextResponse.json({
      hasPurchased: purchased.length > 0,
      review: existing[0] ?? null,
    });
  } catch (err) {
    console.error("Failed to check review eligibility:", err);
    return NextResponse.json({ error: "Kunde inte hämta recensionsstatus." }, { status: 500 });
  }
}
