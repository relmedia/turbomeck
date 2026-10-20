import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { CATALOG_CACHE_TAG } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/revalidate
 *
 * Flushes the storefront's catalogue cache so an admin edit is visible at once
 * rather than up to five minutes later. Called by the admin app's product
 * proxy after any successful create, update or delete.
 *
 * Authenticated with INTERNAL_PRODUCT_API_SECRET, the same shared secret the
 * admin already uses to reach product-service — this endpoint only drops
 * cache entries, but an open one would let anyone force the shop to re-query
 * the database on demand.
 */
function secretMatches(provided: string | null): boolean {
  const expected = process.env.INTERNAL_PRODUCT_API_SECRET?.trim();
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so check that first.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const expected = process.env.INTERNAL_PRODUCT_API_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "INTERNAL_PRODUCT_API_SECRET is not set on the storefront" },
      { status: 503 },
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!secretMatches(bearer)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Next 16 takes a cache-life profile as the second argument: it says how
  // stale an entry may be and still survive. `expire: 0` tolerates nothing,
  // which is the "purge it now" we want after an admin save.
  revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
  return NextResponse.json({ revalidated: true, tag: CATALOG_CACHE_TAG });
}
