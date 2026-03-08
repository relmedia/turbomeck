/** Base URL for product service API. Use proxy in browser to avoid CORS. On server, fetch directly from product service so locale param is guaranteed. */
const PRODUCT_SERVICE_URL =
  process.env.PRODUCT_SERVICE_URL ||
  process.env.NEXT_PUBLIC_PRODUCT_API_URL ||
  "http://localhost:8000";

export const PRODUCT_API =
  typeof window !== "undefined"
    ? "/api/product"
    : `${PRODUCT_SERVICE_URL}/api`;
