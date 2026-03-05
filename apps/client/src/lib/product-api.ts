/** Base URL for product service API. Use proxy in browser to avoid CORS. On server, route through Next.js proxy to avoid direct connection to product-service (handles startup race). */
const SERVER_APP_ORIGIN =
  process.env.NEXTAUTH_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://127.0.0.1:3002";

export const PRODUCT_API =
  typeof window !== "undefined"
    ? "/api/product"
    : `${SERVER_APP_ORIGIN}/api/product`;
