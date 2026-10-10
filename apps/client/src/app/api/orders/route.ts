import { auth } from "@repo/auth";
import { NextResponse } from "next/server";
import { PRODUCT_API } from "@/lib/product-api";
import { internalProductApiAuthHeaders } from "@/lib/internal-product-api";
import { claimGuestOrders } from "@/lib/claim-guest-orders";

/**
 * List orders for the signed-in user only. Proxies to product-service with userId from session
 * so callers cannot pass another account's userId (unlike /api/product/orders?userId=...).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Claim before listing, so an account created after a guest purchase sees
  // that purchase the first time it opens its history. Throttled internally and
  // never throws, so at worst the list is one order short.
  await claimGuestOrders(session.user.id);

  const url = `${PRODUCT_API}/orders?userId=${encodeURIComponent(session.user.id)}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: internalProductApiAuthHeaders(),
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? (JSON.parse(text) as unknown) : [];
  } catch {
    return NextResponse.json(
      { error: "Invalid upstream response" },
      { status: 502 },
    );
  }

  return NextResponse.json(data, { status: res.status });
}
