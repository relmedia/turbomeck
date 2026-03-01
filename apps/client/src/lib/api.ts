import { ProductType } from "@/types";

const PRODUCT_API =
  process.env.NEXT_PUBLIC_PRODUCT_API_URL || "http://localhost:8000";
const UPLOADS_BASE =
  process.env.NEXT_PUBLIC_UPLOADS_BASE || "http://localhost:3001";

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
  createdAt: string;
  updatedAt: string;
};

function resolveImageUrl(path: string | null): string {
  if (!path) return "/products/1g.png";
  if (path.startsWith("/uploads/")) return `${UPLOADS_BASE}${path}`;
  if (path.startsWith("http")) return path;
  return path;
}

export function apiProductToProductType(api: ApiProduct): ProductType {
  const mainImg = resolveImageUrl(api.image || api.thumbnails?.[0] || null);
  const thumbnails = (api.thumbnails ?? []).map((t) => resolveImageUrl(t));
  const galleryImages = [mainImg, ...thumbnails.filter((t) => t !== mainImg)];
  return {
    id: api.id,
    name: api.name,
    shortDescription: api.shortDescription || "",
    description: api.description || "",
    price: api.price,
    weight: api.weight ?? undefined,
    categoryIds: api.categoryIds ?? [],
    attributes: api.attributes ?? [],
    sizes: ["-"],
    colors: ["default"],
    images: { default: mainImg },
    galleryImages: galleryImages.length > 0 ? galleryImages : [mainImg],
  };
}

export async function fetchCategories(): Promise<ApiCategory[]> {
  const res = await fetch(`${PRODUCT_API}/api/categories`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch categories");
  return res.json();
}

export async function fetchProducts(): Promise<ProductType[]> {
  const res = await fetch(`${PRODUCT_API}/api/products`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch products");
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
  stripePaymentId?: string;
  postNordTrackingId?: string;
  items: Array<{
    productId?: number;
    productName: string;
    productImage?: string;
    variant?: string;
    price: number;
    quantity: number;
  }>;
}): Promise<{ id: number; orderNumber: string; postNordTrackingId?: string | null }> {
  const res = await fetch(`${PRODUCT_API}/api/orders`, {
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
  const res = await fetch(`${PRODUCT_API}/api/orders?userId=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch orders");
  return res.json();
}

export async function fetchOrder(orderId: number, userId: string): Promise<Order | null> {
  const res = await fetch(
    `${PRODUCT_API}/api/orders/${orderId}?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  return res.json();
}

export async function fetchProductsByIds(ids: number[]): Promise<ProductType[]> {
  if (ids.length === 0) return [];
  const res = await fetch(
    `${PRODUCT_API}/api/products?ids=${ids.join(",")}`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  const data: ApiProduct[] = await res.json();
  return data.map(apiProductToProductType);
}

export async function fetchProduct(idOrSlug: string): Promise<ProductType | null> {
  const isNumeric = /^\d+$/.test(idOrSlug);
  const url = isNumeric
    ? `${PRODUCT_API}/api/products/${idOrSlug}`
    : `${PRODUCT_API}/api/products/slug/${idOrSlug}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data: ApiProduct = await res.json();
  return apiProductToProductType(data);
}
