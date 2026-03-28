import type { NextConfig } from "next";
import path from "path";

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
    // Must be inlined for client; read from apps/admin/.env (falls back for dev).
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "http://localhost:3001",
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
