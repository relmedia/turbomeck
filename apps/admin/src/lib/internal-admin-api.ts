/**
 * Server-only: the secret that authorises admin-only operations on
 * product-service, separate from `INTERNAL_PRODUCT_API_SECRET`.
 *
 * Both the storefront and admin hold the shared internal secret, so it cannot
 * distinguish them. Creating an order with no payment is a capability the
 * storefront must never have — if the shop's own secret were enough, anything
 * able to call product-service as the shop could mint unpaid orders. This
 * secret lives only in admin's environment and on product-service.
 *
 * Must match `INTERNAL_ADMIN_API_SECRET` in apps/product-service.
 */
export function requireInternalAdminSecret(): string {
  const s = process.env.INTERNAL_ADMIN_API_SECRET?.trim();
  if (!s) {
    throw new Error(
      "INTERNAL_ADMIN_API_SECRET is not set (required for admin-only product-service calls).",
    );
  }
  return s;
}

/** Header product-service checks for admin-only routes. */
export function internalAdminAuthHeaders(): {
  "X-Internal-Admin-Secret": string;
} {
  return { "X-Internal-Admin-Secret": requireInternalAdminSecret() };
}
