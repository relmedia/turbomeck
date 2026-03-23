import { ProductType } from "@/types";
import { PRODUCT_API } from "./product-api";
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
  /** Core exchange: deposit (SEK) to pay upfront; balance paid after old part received and new turbo shipped */
  depositAmount?: number | null;
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
    categoryIds: api.categoryIds ?? [],
    attributes: api.attributes ?? [],
    depositAmount: api.depositAmount ?? undefined,
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

export async function fetchCategories(locale?: "sv" | "en"): Promise<ApiCategory[]> {
  const url = locale ? `${PRODUCT_API}/categories?locale=${locale}` : `${PRODUCT_API}/categories`;
  const res = await fetchWithRetry(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch categories");
  return res.json();
}

export async function fetchProducts(locale?: "sv" | "en"): Promise<ProductType[]> {
  const url = locale ? `${PRODUCT_API}/products?locale=${locale}` : `${PRODUCT_API}/products`;
  const res = await fetchWithRetry(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch products");
  const data: ApiProduct[] = await res.json();
  return data.map(apiProductToProductType);
}

/** Fetch products featured in the homepage slider (featuredInSlider=1, ordered by sliderOrder) */
export async function fetchSliderProducts(locale?: "sv" | "en"): Promise<ProductType[]> {
  const params = new URLSearchParams({ featuredInSlider: "1" });
  if (locale) params.set("locale", locale);
  const res = await fetchWithRetry(`${PRODUCT_API}/products?${params}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data: ApiProduct[] = await res.json();
  return data.map(apiProductToProductType);
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
  subtotal: number;
  shippingCost: number;
  discount?: number;
  total: number;
  depositAmount?: number;
  balanceDue?: number;
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
}): Promise<{ id: number; orderNumber: string; postNordTrackingId?: string | null }> {
  const res = await fetch(`${PRODUCT_API}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create order");
  }
  return res.json();
}

export async function fetchOrders(userId: string): Promise<Order[]> {
  const res = await fetch(`${PRODUCT_API}/orders?userId=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch orders");
  return res.json();
}

export async function fetchOrder(orderId: number, userId: string): Promise<Order | null> {
  const res = await fetch(
    `${PRODUCT_API}/orders/${orderId}?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
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
  const res = await fetch(url, { cache: "no-store" });
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

export async function fetchReviews(productId: number): Promise<ReviewsResponse> {
  const res = await fetch(`${PRODUCT_API}/reviews?productId=${productId}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch reviews");
  return res.json();
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

export async function fetchMyReviewedProductIds(): Promise<number[]> {
  const res = await fetch("/api/reviews/me", { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.productIds ?? [];
}

export async function fetchMyReviews(): Promise<MyReview[]> {
  const res = await fetch("/api/reviews/me", { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
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
