/**
 * Server-only: shared secret for calls to product-service (must match INTERNAL_PRODUCT_API_SECRET there).
 */

export function requireInternalProductApiSecret(): string {
  const s = process.env.INTERNAL_PRODUCT_API_SECRET?.trim();
  if (!s) {
    throw new Error(
      "INTERNAL_PRODUCT_API_SECRET is not set (required to reach product-service)."
    );
  }
  return s;
}

export function internalProductApiAuthHeaders(): { Authorization: string } {
  const token = requireInternalProductApiSecret();
  return { Authorization: `Bearer ${token}` };
}

/**
 * Browser calls go to `/api/product` (proxy adds the secret). Server-side calls hit
 * PRODUCT_SERVICE_URL directly and must attach the Bearer token.
 */
export function productApiRequestInit(base: RequestInit = {}): RequestInit {
  if (typeof window !== "undefined") {
    return base;
  }
  const auth = internalProductApiAuthHeaders();
  const h = new Headers(base.headers);
  h.set("Authorization", auth.Authorization);
  return { ...base, headers: h };
}
