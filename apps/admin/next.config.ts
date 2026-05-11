import type { NextConfig } from "next";
import path from "path";

const ADMIN_STUDIO_HOST = process.env.ADMIN_STUDIO_HOSTNAME?.trim() || "studio.turbomeck.cloud";
const SHOP_APEX_HOSTS = new Set(
  (process.env.ADMIN_SHOP_AUTH_HOSTNAMES || "turbomeck.cloud,www.turbomeck.cloud")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean),
);

/** If .env reuses the shop apex for NEXTAUTH_URL, magic links must use the studio host instead. */
function coerceAdminAuthOriginToStudio(raw: string): string {
  const t = raw.trim().replace(/\/$/, "");
  try {
    const u = new URL(t);
    if (SHOP_APEX_HOSTS.has(u.hostname)) {
      u.hostname = new URL(`https://${ADMIN_STUDIO_HOST}`).hostname;
      return u.origin;
    }
    return t.includes("://") ? u.origin : t;
  } catch {
    return t;
  }
}

/* Staff UI is served at `/` (e.g. /products). NextAuth must use `/` for `pages.signIn` / `pages.error`. */
process.env.AUTH_SIGNIN_PATH = "/";
process.env.AUTH_VERIFY_PATH =
  process.env.AUTH_VERIFY_PATH?.trim() || "/verify";

/* Lets @repo/auth reliably treat this process as studio (avoid relying on AUTH_VERIFY_PATH in the bundle). */
process.env.STUDIO_AUTH_MAGIC_LINKS = "1";

/* Auth.js uses AUTH_URL for absolute URLs in emails; ADMIN_CANONICAL_ORIGIN wins when set. */
let adminPublicUrl =
  process.env.ADMIN_CANONICAL_ORIGIN?.trim() ||
  process.env.NEXTAUTH_URL?.trim() ||
  process.env.AUTH_URL?.trim();
if (adminPublicUrl) {
  adminPublicUrl = coerceAdminAuthOriginToStudio(adminPublicUrl);
  process.env.AUTH_URL = adminPublicUrl;
  process.env.NEXTAUTH_URL = adminPublicUrl;
}
/* Emails: @repo/auth rewrites callback links to this origin (must match the host users open in the browser). */
const adminMagicLinkOrigin =
  adminPublicUrl ||
  (process.env.NODE_ENV === "development" ? "http://localhost:3001" : "");
if (adminMagicLinkOrigin) {
  process.env.PUBLIC_AUTH_ORIGIN = adminMagicLinkOrigin;
}

function getR2ImagePattern() {
  try {
    const url = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
    if (!url) return [];
    return [{ protocol: "https" as const, hostname: new URL(url).hostname, pathname: "/**" }];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/ui"],
  /** Legacy bookmarks: /studio/... → /... */
  async redirects() {
    return [
      { source: "/studio", destination: "/", permanent: true },
      { source: "/studio/", destination: "/", permanent: true },
      { source: "/studio/:path*", destination: "/:path*", permanent: true },
    ];
  },
  env: {
    /* Inlined for next-auth/react. Never default to http://localhost in production builds
     * (mixed content / wrong origin). Set NEXTAUTH_URL or AUTH_URL on the server and at build time. */
    ...((() => {
      const url = adminPublicUrl;
      if (url) return { NEXTAUTH_URL: url };
      if (process.env.NODE_ENV === "development") {
        return { NEXTAUTH_URL: "http://localhost:3001" };
      }
      return {};
    })()),
    NEXT_PUBLIC_ADMIN_ORIGIN:
      adminMagicLinkOrigin ||
      (process.env.NODE_ENV === "development"
        ? "http://localhost:3001"
        : `https://${ADMIN_STUDIO_HOST}`),
    NEXT_PUBLIC_SHOP_LOGIN_HOSTS:
      process.env.ADMIN_SHOP_AUTH_HOSTNAMES || "turbomeck.cloud,www.turbomeck.cloud",
  },
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
      {
        protocol: "https",
        hostname: "images.clerk.dev",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      // R2 S3 endpoint (fallback; set NEXT_PUBLIC_R2_PUBLIC_URL for public URLs)
      { protocol: "https", hostname: "10249571bfc72d7eb7816158e9d29a34.r2.cloudflarestorage.com", pathname: "/**" },
      // R2 public URL – set NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-xxx.r2.dev for working images
      ...getR2ImagePattern(),
    ],
  },
};

export default nextConfig;
