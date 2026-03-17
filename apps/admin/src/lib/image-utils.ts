/**
 * Resolve image URL for display. Rewrites R2 S3 endpoint URLs (r2.cloudflarestorage.com)
 * to the public R2 URL when NEXT_PUBLIC_R2_PUBLIC_URL is set – the S3 endpoint returns
 * 400 for unauthenticated requests.
 */
const UPLOADS_BASE =
  process.env.NEXT_PUBLIC_UPLOADS_BASE || "http://localhost:3001";
const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

export function resolveImageUrl(path: string | null): string {
  if (!path) return "/products/1g.png";
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

/** Full fetchable URL for API calls (e.g. remove-background). */
export function getFetchableImageUrl(path: string | null): string {
  if (!path) return "";
  if (path.startsWith("http")) {
    // Ensure R2 path includes products/ prefix (some stored URLs may omit it)
    try {
      const url = new URL(path);
      const pathname = url.pathname.replace(/^\//, "");
      if (pathname && !pathname.startsWith("products/") && !pathname.includes("/products/")) {
        url.pathname = `/products/${pathname}`;
        return url.toString();
      }
      return path;
    } catch {
      return path;
    }
  }
  const base = (R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!base) return path;
  // Ensure path has products/ prefix for R2
  const normalized = path.startsWith("products/") ? path : `products/${path.replace(/^.*[/\\]/, "")}`;
  return `${base}/${normalized}`;
}
