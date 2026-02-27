import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const PRODUCT_API =
  process.env.NEXT_PUBLIC_PRODUCT_API_URL || process.env.PRODUCT_API_URL || "http://localhost:8000";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let orders: unknown[] = [];
  try {
    const ordersRes = await fetch(
      `${PRODUCT_API}/api/orders?userId=${encodeURIComponent(session.user.id)}`,
      { cache: "no-store" }
    );
    if (ordersRes.ok) orders = await ordersRes.json();
  } catch {
    // Non-blocking
  }

  const exportData = {
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      createdAt: user.createdAt?.toISOString() ?? null,
      role: user.role,
    },
    savedAddress: user.metadata?.savedAddress ?? null,
    wishlist: user.metadata?.savedWishlist ?? [],
    orders,
  };

  return NextResponse.json(exportData, {
    headers: {
      "Content-Disposition": `attachment; filename="turbomeck-mina-uppgifter-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
