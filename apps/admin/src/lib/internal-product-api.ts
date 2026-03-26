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
