import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { reviews, products, users } from "@repo/database";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** GET /api/reviews/[id] - Admin fetch single review */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Logga in" }, { status: 401 });
  }

  const { id } = await params;
  const reviewId = Number(id);
  if (!Number.isInteger(reviewId) || reviewId < 1) {
    return NextResponse.json({ error: "Ogiltigt id" }, { status: 400 });
  }

  try {
    const [row] = await db
      .select({
        id: reviews.id,
        productId: reviews.productId,
        rating: reviews.rating,
        title: reviews.title,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
        editedAt: reviews.editedAt,
        productName: products.name,
        userName: users.name,
      })
      .from(reviews)
      .innerJoin(products, eq(reviews.productId, products.id))
      .innerJoin(users, eq(reviews.userId, users.id))
      .where(eq(reviews.id, reviewId));

    if (!row) {
      return NextResponse.json({ error: "Recension hittades inte" }, { status: 404 });
    }

    return NextResponse.json({
      id: row.id,
      productId: row.productId,
      productName: row.productName ?? "—",
      userName: row.userName ?? "Anonym",
      rating: row.rating,
      title: row.title,
      comment: row.comment,
      createdAt: String(row.createdAt),
      editedAt: row.editedAt ? String(row.editedAt) : null,
    });
  } catch (err) {
    console.error("Failed to fetch review:", err);
    return NextResponse.json({ error: "Kunde inte hämta" }, { status: 500 });
  }
}

/** DELETE /api/reviews/[id] - Admin delete a review */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Logga in" }, { status: 401 });
  }

  const { id } = await params;
  const reviewId = Number(id);
  if (!Number.isInteger(reviewId) || reviewId < 1) {
    return NextResponse.json({ error: "Ogiltigt id" }, { status: 400 });
  }

  try {
    const [deleted] = await db
      .delete(reviews)
      .where(eq(reviews.id, reviewId))
      .returning({ id: reviews.id });
    if (!deleted) {
      return NextResponse.json({ error: "Recension hittades inte" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete review:", err);
    return NextResponse.json({ error: "Kunde inte ta bort" }, { status: 500 });
  }
}

/** PATCH /api/reviews/[id] - Admin update a review (bypasses user edit lock) */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Logga in" }, { status: 401 });
  }

  const { id } = await params;
  const reviewId = Number(id);
  if (!Number.isInteger(reviewId) || reviewId < 1) {
    return NextResponse.json({ error: "Ogiltigt id" }, { status: 400 });
  }

  let body: { rating?: number; title?: string | null; comment?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  if (body.rating != null && (body.rating < 1 || body.rating > 5 || !Number.isInteger(body.rating))) {
    return NextResponse.json({ error: "Rating måste vara 1–5" }, { status: 400 });
  }

  try {
    const updateData: Record<string, unknown> = {};
    if (body.rating != null) updateData.rating = body.rating;
    if (body.title !== undefined) updateData.title = body.title;
    if (body.comment !== undefined) updateData.comment = body.comment;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Inga fält att uppdatera" }, { status: 400 });
    }

    const [updated] = await db
      .update(reviews)
      .set(updateData)
      .where(eq(reviews.id, reviewId))
      .returning();
    if (!updated) {
      return NextResponse.json({ error: "Recension hittades inte" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      review: {
        id: updated.id,
        productId: updated.productId,
        rating: updated.rating,
        title: updated.title,
        comment: updated.comment,
        createdAt: updated.createdAt,
        editedAt: updated.editedAt,
      },
    });
  } catch (err) {
    console.error("Failed to update review:", err);
    return NextResponse.json({ error: "Kunde inte uppdatera" }, { status: 500 });
  }
}
