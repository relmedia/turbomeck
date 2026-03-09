import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { reviews, users } from "@repo/database/schema";
import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/** GET /api/reviews/stats - Aggregate stats for dashboard */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Logga in" }, { status: 401 });
  }

  try {
    const [stats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        avg: sql<number>`coalesce(avg(${reviews.rating})::decimal, 0)`,
        r5: sql<number>`count(*) filter (where ${reviews.rating} = 5)::int`,
        r4: sql<number>`count(*) filter (where ${reviews.rating} = 4)::int`,
        r3: sql<number>`count(*) filter (where ${reviews.rating} = 3)::int`,
        r2: sql<number>`count(*) filter (where ${reviews.rating} = 2)::int`,
        r1: sql<number>`count(*) filter (where ${reviews.rating} = 1)::int`,
      })
      .from(reviews);

    const total = stats?.total ?? 0;
    const avg = stats?.avg ? Number(stats.avg) : 0;
    const byRating = [
      { stars: 5, count: stats?.r5 ?? 0, color: "bg-emerald-500" },
      { stars: 4, count: stats?.r4 ?? 0, color: "bg-emerald-400" },
      { stars: 3, count: stats?.r3 ?? 0, color: "bg-amber-400" },
      { stars: 2, count: stats?.r2 ?? 0, color: "bg-amber-500" },
      { stars: 1, count: stats?.r1 ?? 0, color: "bg-red-500" },
    ];

    let latestReview: {
      userName: string;
      rating: number;
      title: string | null;
      comment: string | null;
      createdAt: string;
      orderId: number | null;
    } | null = null;

    if (total > 0) {
      const [latest] = await db
        .select({
          userName: users.name,
          rating: reviews.rating,
          title: reviews.title,
          comment: reviews.comment,
          createdAt: reviews.createdAt,
          orderId: reviews.orderId,
        })
        .from(reviews)
        .innerJoin(users, eq(reviews.userId, users.id))
        .orderBy(desc(reviews.createdAt))
        .limit(1);

      if (latest) {
        latestReview = {
          userName: latest.userName ?? "Anonym",
          rating: latest.rating,
          title: latest.title,
          comment: latest.comment,
          createdAt: String(latest.createdAt),
          orderId: latest.orderId,
        };
      }
    }

    return NextResponse.json({
      total,
      avg,
      byRating,
      latestReview,
    });
  } catch (err) {
    console.error("Failed to fetch review stats:", err);
    return NextResponse.json(
      { error: "Kunde inte hämta statistik" },
      { status: 500 }
    );
  }
}
