import type { NextConfig } from "next";
import path from "path";

/* Staff UI is served at `/` (rewritten to `/studio` internally). NextAuth must use `/`
 * for `pages.signIn` / `pages.error`, otherwise flows redirect the browser to `/studio`. */
process.env.AUTH_SIGNIN_PATH = "/";
process.env.AUTH_VERIFY_PATH =
  process.env.AUTH_VERIFY_PATH?.trim() || "/studio/verify";

/* Auth.js uses AUTH_URL for absolute URLs in emails; keep both in sync (NEXTAUTH_URL wins if both set). */
const adminPublicUrl = process.env.NEXTAUTH_URL?.trim() || process.env.AUTH_URL?.trim();
if (adminPublicUrl) {
  process.env.AUTH_URL = adminPublicUrl;
  process.env.NEXTAUTH_URL = adminPublicUrl;
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
  // Subdomain studio.turbomeck.cloud should use / as entry (not /studio in the URL bar).
  async redirects() {
    return [
      { source: "/studio", destination: "/", permanent: true },
      { source: "/studio/", destination: "/", permanent: true },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/studio" }],
    };
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
