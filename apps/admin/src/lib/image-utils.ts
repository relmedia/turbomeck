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
