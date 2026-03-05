import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { reviews } from "@repo/database";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

/** PATCH: Update a review. User can edit max once; after that it is locked. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Logga in för att redigera." }, { status: 401 });
  }

  const { id } = await params;
  const reviewId = Number(id);
  if (!Number.isInteger(reviewId) || reviewId < 1) {
    return NextResponse.json({ error: "Ogiltigt recensions-id" }, { status: 400 });
  }

  let body: { rating?: number; title?: string; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  const rating = typeof body.rating === "number" ? body.rating : undefined;
  const title = typeof body.title === "string" ? body.title.trim() || null : undefined;
  const comment = typeof body.comment === "string" ? body.comment.trim() || null : undefined;

  if (rating != null && (rating < 1 || rating > 5 || !Number.isInteger(rating))) {
    return NextResponse.json(
      { error: "Rating måste vara 1–5" },
      { status: 400 }
    );
  }

  try {
    const [existing] = await db
      .select({ id: reviews.id, userId: reviews.userId, editedAt: reviews.editedAt })
      .from(reviews)
      .where(eq(reviews.id, reviewId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Recensionen hittades inte." }, { status: 404 });
    }
    if (existing.userId !== session.user!.id!) {
      return NextResponse.json({ error: "Du kan inte redigera denna recension." }, { status: 403 });
    }
    if (existing.editedAt != null) {
      return NextResponse.json(
        { error: "Recensionen har redan redigerats och är låst." },
        { status: 403 }
      );
    }

    const updateData: { rating?: number; title?: string | null; comment?: string | null; editedAt: Date } = {
      editedAt: new Date(),
    };
    if (rating != null) updateData.rating = rating;
    if (title !== undefined) updateData.title = title;
    if (comment !== undefined) updateData.comment = comment;

    const [updated] = await db
      .update(reviews)
      .set(updateData)
      .where(and(eq(reviews.id, reviewId), eq(reviews.userId, session.user!.id!)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Kunde inte uppdatera recensionen." }, { status: 500 });
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
    return NextResponse.json({ error: "Kunde inte uppdatera recensionen." }, { status: 500 });
  }
}
