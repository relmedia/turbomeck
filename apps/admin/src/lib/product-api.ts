/** Base URL for product service API. Use proxy in browser to avoid CORS. */
export const PRODUCT_API =
  typeof window !== "undefined"
    ? "/api/product"
    : (process.env.PRODUCT_SERVICE_URL || process.env.NEXT_PUBLIC_PRODUCT_API_URL || "http://localhost:8000") + "/api";
