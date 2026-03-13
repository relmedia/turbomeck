import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { reviews, products, users } from "@repo/database";
import { eq, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

/** GET /api/reviews - List all reviews for admin. Optional ?productId=N filters by product. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Logga in" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const productIdParam = searchParams.get("productId");
    const productId = productIdParam ? parseInt(productIdParam, 10) : null;

    const selectFields = {
      id: reviews.id,
      productId: reviews.productId,
      rating: reviews.rating,
      title: reviews.title,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      editedAt: reviews.editedAt,
      productName: products.name,
      userName: users.name,
    };

    const rows =
      productId != null && !Number.isNaN(productId)
        ? await db
            .select(selectFields)
            .from(reviews)
            .innerJoin(products, eq(reviews.productId, products.id))
            .innerJoin(users, eq(reviews.userId, users.id))
            .where(eq(reviews.productId, productId))
            .orderBy(desc(reviews.createdAt))
        : await db
            .select(selectFields)
            .from(reviews)
            .innerJoin(products, eq(reviews.productId, products.id))
            .innerJoin(users, eq(reviews.userId, users.id))
            .orderBy(desc(reviews.createdAt));

    const list = rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      productName: r.productName ?? "—",
      userName: r.userName ?? "Anonym",
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      createdAt: String(r.createdAt),
      editedAt: r.editedAt ? String(r.editedAt) : null,
    }));

    return NextResponse.json(list);
  } catch (err) {
    console.error("Failed to fetch reviews:", err);
    return NextResponse.json(
      { error: "Kunde inte hämta recensioner" },
      { status: 500 }
    );
  }
}
