import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSameOrigin } from "@/lib/same-origin";

export async function POST(req: Request) {
  // SECURITY (audit M3): same-origin gate on cookie-auth state change.
  const csrfDenied = requireSameOrigin(req);
  if (csrfDenied) return csrfDenied;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { productId?: number; action?: "add" | "remove" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const productId = typeof body.productId === "number" ? body.productId : undefined;
  const action = body.action === "add" || body.action === "remove" ? body.action : undefined;

  if (productId == null || !action) {
    return NextResponse.json(
      { error: "productId and action (add|remove) required" },
      { status: 400 }
    );
  }

  try {
    // SECURITY (audit M10): explicit column projection — never select * from users
    // here. The row's `password` hash would otherwise sit in process memory for
    // the lifetime of this handler.
    const [user] = await db
      .select({ id: users.id, metadata: users.metadata })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const current = user.metadata?.savedWishlist ?? [];
    let next: number[];
    if (action === "add") {
      next = current.includes(productId) ? current : [...current, productId];
    } else {
      next = current.filter((id) => id !== productId);
    }

    await db
      .update(users)
      .set({
        metadata: { ...user.metadata, savedWishlist: next },
      })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ success: true, wishlist: next });
  } catch (err) {
    console.error("Failed to update wishlist:", err);
    return NextResponse.json(
      { error: "Failed to update wishlist" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const session = await auth();
  // SECURITY (audit L1): return 401 for unauthenticated callers instead of
  // pretending the wishlist is empty. The old 200 + empty body let pages
  // render as if the user "had no items" even when they were silently
  // logged out — a UX bug that doubles as authentication confusion.
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [user] = await db
      .select({ metadata: users.metadata })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    const wishlist = user?.metadata?.savedWishlist ?? [];
    return NextResponse.json({ wishlist });
  } catch {
    return NextResponse.json({ wishlist: [] });
  }
}
