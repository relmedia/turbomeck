import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { reviews } from "@repo/database";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Returns product IDs the current user has reviewed. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ productIds: [], reviews: [] });
  }

  try {
    const rows = await db
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
      .where(eq(reviews.userId, session.user!.id!));
    return NextResponse.json({
      productIds: rows.map((r) => r.productId),
      reviews: rows,
    });
  } catch (err) {
    console.error("Failed to fetch user reviews:", err);
    return NextResponse.json({ productIds: [], reviews: [] });
  }
}
