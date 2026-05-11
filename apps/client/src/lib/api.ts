import { ProductType } from "@/types";
import { PRODUCT_API } from "./product-api";
import { productApiRequestInit } from "./internal-product-api";
const UPLOADS_BASE =
  process.env.NEXT_PUBLIC_UPLOADS_BASE || "http://localhost:3001";
/** Public R2 base URL (e.g. https://pub-xxx.r2.dev) – used to rewrite S3 endpoint URLs which return 400 for unauthenticated requests */
const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

export type ApiCategory = {
  id: number;
  name: string;
  description: string | null;
  parentId: number | null;
  parentName: string | null;
  createdAt: string;
};

export type ApiProduct = {
  id: number;
  slug?: string;
  name: string;
  shortDescription: string;
  description: string;
  price: number;
  image: string | null;
  thumbnails: string[];
  stock: number;
  weight: number | null;
  categoryIds: number[];
  attributes?: { name: string; options: string[] }[];
  isExchangeTurbo?: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Resolve image URL for display. Rewrites R2 S3 endpoint URLs (r2.cloudflarestorage.com)
 * to the public R2 URL when NEXT_PUBLIC_R2_PUBLIC_URL is set – the S3 endpoint returns
 * 400 for unauthenticated requests.
 */
export function resolveImageUrl(path: string | null): string {
  if (!path) return "/logo.svg";
  if (path.startsWith("/uploads/")) return `${UPLOADS_BASE}${path}`;
  if (path.startsWith("http")) {
    if (R2_PUBLIC_URL && path.includes("r2.cloudflarestorage.com")) {
      try {
        const url = new URL(path);
        const base = R2_PUBLIC_URL.replace(/\/$/, "");
        return `${base}${url.pathname}`;
      } catch {
        return path;
      }
    }
    return path;
  }
  return path;
}

export function apiProductToProductType(api: ApiProduct): ProductType {
  const mainImg = resolveImageUrl(api.image || api.thumbnails?.[0] || null);
  const thumbnails = (api.thumbnails ?? []).map((t) => resolveImageUrl(t));
  const galleryImages = [mainImg, ...thumbnails.filter((t) => t !== mainImg)];
  return {
    id: api.id,
    slug: api.slug,
    name: api.name,
    shortDescription: api.shortDescription || "",
    description: api.description || "",
    price: api.price,
    weight: api.weight ?? undefined,
    stock: api.stock ?? 0,
    categoryIds: api.categoryIds ?? [],
    attributes: api.attributes ?? [],
    isExchangeTurbo: api.isExchangeTurbo === true,
    sizes: ["-"],
    colors: ["default"],
    images: { default: mainImg },
    galleryImages: galleryImages.length > 0 ? galleryImages : [mainImg],
  };
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      const isConnectionError =
        err instanceof TypeError && (err.cause as { code?: string } | undefined)?.code === "ECONNREFUSED";
      if (isConnectionError && i < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed after retries");
}

async function readProductApiJson<T>(res: Response, url: string, label: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    const preview = text.replace(/\s+/g, " ").slice(0, 500);
    console.error(`[catalog] ${label}: HTTP ${res.status} ${url} — ${preview || "(empty body)"}`);
    throw new Error(`${label} (${res.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    console.error(`[catalog] ${label}: invalid JSON from ${url}`, text.slice(0, 200));
    throw new Error(`${label} (invalid JSON)`);
  }
}

export async function fetchCategories(locale?: "sv" | "en"): Promise<ApiCategory[]> {
  const url = locale ? `${PRODUCT_API}/categories?locale=${locale}` : `${PRODUCT_API}/categories`;
  const res = await fetchWithRetry(url, productApiRequestInit({ cache: "no-store" }));
  return readProductApiJson<ApiCategory[]>(res, url, "Failed to fetch categories");
}

export async function fetchProducts(locale?: "sv" | "en"): Promise<ProductType[]> {
  const url = locale ? `${PRODUCT_API}/products?locale=${locale}` : `${PRODUCT_API}/products`;
  const res = await fetchWithRetry(url, productApiRequestInit({ cache: "no-store" }));
  const data = await readProductApiJson<ApiProduct[]>(res, url, "Failed to fetch products");
  return data.map(apiProductToProductType);
}

/** Fetch products featured in the homepage slider (featuredInSlider=1, ordered by sliderOrder) */
export async function fetchSliderProducts(locale?: "sv" | "en"): Promise<ProductType[]> {
  const params = new URLSearchParams({ featuredInSlider: "1" });
  if (locale) params.set("locale", locale);
  const url = `${PRODUCT_API}/products?${params}`;
  const res = await fetchWithRetry(url, productApiRequestInit({ cache: "no-store" }));
  const text = await res.text();
  if (!res.ok) {
    console.error(
      `[catalog] fetchSliderProducts: HTTP ${res.status} ${url}`,
      text.replace(/\s+/g, " ").slice(0, 400),
    );
    return [];
  }
  try {
    const data = JSON.parse(text) as ApiProduct[];
    return data.map(apiProductToProductType);
  } catch {
    return [];
  }
}

export type OrderItem = {
  id: number;
  productId: number | null;
  productName: string;
  productImage: string | null;
  price: number;
  quantity: number;
};

export type Order = {
  id: number;
  orderNumber: string;
  email: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  servicePointName: string | null;
  deliveryOption: string | null;
  subtotal: number;
  shippingCost: number;
  discount: number;
  total: number;
  status: string;
  postNordTrackingId: string | null;
  stripePaymentId: string | null;
  createdAt: string;
  items: OrderItem[];
};

export async function createOrder(orderData: {
  userId?: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  address: string;
  city: string;
  postalCode: string;
  country?: string;
  servicePointName?: string;
  servicePointId?: string;
  deliveryOption?: string;
  /** Applied discount code — server recomputes discount from DB rules; do not trust client totals. */
  couponCode?: string;
  subtotal: number;
  shippingCost: number;
  discount?: number;
  total: number;
  /** Sweden: true = commits to return old turbo within 14 days (no 1000 kr core fee at checkout). */
  commitsCoreReturnWithin14?: boolean;
  stripePaymentId?: string;
  postNordTrackingId?: string;
  locale?: "sv" | "en";
  items: Array<{
    productId?: number;
    productName: string;
    productImage?: string;
    variant?: string;
    price: number;
    quantity: number;
  }>;
}): Promise<{
  id: number;
  orderNumber: string;
  postNordTrackingId?: string | null;
  viewToken?: string | null;
}> {
  const res = await fetch(
    `${PRODUCT_API}/orders`,
    productApiRequestInit({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderData),
    }),
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create order");
  }
  return res.json();
}

/** Uses `/api/orders` — server attaches session userId; do not pass userId from the client. */
export async function fetchOrders(): Promise<Order[]> {
  const res = await fetch("/api/orders", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch orders");
  return res.json();
}

export async function fetchOrder(
  orderId: number,
  userId: string,
  viewToken?: string | null,
): Promise<Order | null> {
  const q = new URLSearchParams();
  if (userId) q.set("userId", userId);
  if (viewToken) q.set("token", viewToken);
  const qs = q.toString();
  const res = await fetch(
    `${PRODUCT_API}/orders/${orderId}${qs ? `?${qs}` : ""}`,
    productApiRequestInit({ cache: "no-store" }),
  );
  if (!res.ok) return null;
  return res.json();
}

export async function fetchProductsByIds(ids: number[], locale?: "sv" | "en"): Promise<ProductType[]> {
  if (ids.length === 0) return [];
  const params = new URLSearchParams({ ids: ids.join(",") });
  if (locale) params.set("locale", locale);
  const res = await fetch(
    `${PRODUCT_API}/products?${params.toString()}`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  const data: ApiProduct[] = await res.json();
  return data.map(apiProductToProductType);
}

export async function fetchProduct(idOrSlug: string, locale?: "sv" | "en"): Promise<ProductType | null> {
  const isNumeric = /^\d+$/.test(idOrSlug);
  const base = isNumeric
    ? `${PRODUCT_API}/products/${idOrSlug}`
    : `${PRODUCT_API}/products/slug/${idOrSlug}`;
  const url = locale ? `${base}?locale=${locale}` : base;
  const res = await fetch(url, productApiRequestInit({ cache: "no-store" }));
  if (!res.ok) return null;
  const data: ApiProduct = await res.json();
  return apiProductToProductType(data);
}

// ============ REVIEWS ============
export type ApiReview = {
  id: number;
  productId: number;
  userId: string;
  orderId: number | null;
  rating: number;
  title: string | null;
  comment: string | null;
  createdAt: string;
  userName: string;
  verifiedPurchase: boolean;
};

export type ReviewsResponse = {
  reviews: ApiReview[];
  averageRating: number;
  totalCount: number;
};

const EMPTY_REVIEWS: ReviewsResponse = {
  reviews: [],
  averageRating: 0,
  totalCount: 0,
};

/**
 * Reviews aggregate is best-effort: a transient empty body (e.g. dev HMR
 * cancellation) or upstream hiccup must NOT crash the product page. We read
 * `res.text()` first and only call `JSON.parse` when there's something to parse.
 */
export async function fetchReviews(productId: number): Promise<ReviewsResponse> {
  const url = `${PRODUCT_API}/reviews?productId=${productId}`;
  let res: Response;
  try {
    res = await fetch(url, productApiRequestInit({ cache: "no-store" }));
  } catch (err) {
    console.warn(`[reviews] network error for ${url}:`, err);
    return EMPTY_REVIEWS;
  }
  if (!res.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[reviews] HTTP ${res.status} for ${url}`);
    }
    return EMPTY_REVIEWS;
  }
  const text = await res.text();
  if (!text.trim()) return EMPTY_REVIEWS;
  try {
    return JSON.parse(text) as ReviewsResponse;
  } catch {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[reviews] invalid JSON from ${url}:`, text.slice(0, 200));
    }
    return EMPTY_REVIEWS;
  }
}

export type MyReview = {
  id: number;
  productId: number;
  rating: number;
  title: string | null;
  comment: string | null;
  createdAt: string;
  editedAt: string | null;
};

async function safeJson<T>(res: Response, fallback: T): Promise<T> {
  const text = await res.text();
  if (!text.trim()) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export async function fetchMyReviewedProductIds(): Promise<number[]> {
  const res = await fetch("/api/reviews/me", { cache: "no-store" });
  if (!res.ok) return [];
  const data = await safeJson<{ productIds?: number[] }>(res, {});
  return data.productIds ?? [];
}

export async function fetchMyReviews(): Promise<MyReview[]> {
  const res = await fetch("/api/reviews/me", { cache: "no-store" });
  if (!res.ok) return [];
  const data = await safeJson<{ reviews?: MyReview[] }>(res, {});
  return data.reviews ?? [];
}

export async function createReview(data: {
  productId: number;
  rating: number;
  title?: string;
  comment?: string;
}): Promise<{ success: boolean; review: ApiReview; verifiedPurchase: boolean }> {
  const res = await fetch("/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create review");
  }
  return res.json();
}

export async function updateReview(
  reviewId: number,
  data: { rating: number; title?: string; comment?: string }
): Promise<{ success: boolean; review: MyReview }> {
  const res = await fetch(`/api/reviews/${reviewId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Kunde inte uppdatera recensionen.");
  }
  return res.json();
}
