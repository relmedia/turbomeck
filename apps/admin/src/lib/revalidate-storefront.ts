/**
 * Flush the storefront's catalogue cache after an admin edit.
 *
 * The shop caches catalogue reads for 300s, so a new or edited product used to
 * take up to five minutes to appear — long enough that it reads as "the save
 * didn't work". This tells the storefront to drop those entries now; the 300s
 * window stays as the backstop for when this call cannot be made.
 *
 * Deliberately never throws. A failed revalidation means the shop is briefly
 * stale, which must not turn a successful save into an error in the admin.
 */

/** Paths whose mutations change what the shop renders. */
const CATALOG_PREFIXES = ["products", "categories", "product-categories"];

export function affectsStorefrontCatalog(pathStr: string): boolean {
  const head = pathStr.split("/")[0] ?? "";
  return CATALOG_PREFIXES.includes(head);
}

function storefrontBaseUrl(): string | null {
  const raw = (
    process.env.STOREFRONT_URL ||
    process.env.NEXT_PUBLIC_CLIENT_URL ||
    process.env.CLIENT_URL ||
    ""
  ).trim();
  return raw ? raw.replace(/\/$/, "") : null;
}

export async function revalidateStorefrontCatalog(reason: string): Promise<boolean> {
  const secret = process.env.INTERNAL_PRODUCT_API_SECRET?.trim();
  const base = storefrontBaseUrl();

  if (!secret || !base) {
    // Warn once per call rather than silently doing nothing: a missing
    // STOREFRONT_URL is the difference between "instant" and "five minutes",
    // and that is invisible from the admin otherwise.
    console.warn(
      `[revalidate] skipped (${reason}) — ${!base ? "STOREFRONT_URL not set" : "INTERNAL_PRODUCT_API_SECRET not set"}`,
    );
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${base}/api/revalidate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        console.warn(`[revalidate] storefront returned HTTP ${res.status} (${reason})`);
        return false;
      }
      return true;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.warn(
      `[revalidate] could not reach storefront (${reason}):`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
