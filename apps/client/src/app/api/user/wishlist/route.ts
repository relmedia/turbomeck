import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
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
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const current = (user.publicMetadata?.savedWishlist as number[] | undefined) ?? [];

    let next: number[];
    if (action === "add") {
      next = current.includes(productId) ? current : [...current, productId];
    } else {
      next = current.filter((id) => id !== productId);
    }

    await client.users.updateUserMetadata(userId, {
      publicMetadata: { ...user.publicMetadata, savedWishlist: next },
    });

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
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ wishlist: [] });
  }
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const wishlist = (user.publicMetadata?.savedWishlist as number[] | undefined) ?? [];
  return NextResponse.json({ wishlist });
}
