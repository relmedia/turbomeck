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
  async headers() {
    return [
      {
        source: "/account",
        headers: [{ key: "Cache-Control", value: "no-store, private, must-revalidate" }],
      },
      {
        source: "/account/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, private, must-revalidate" }],
      },
    ];
  },
  env: {
    // Pin next-auth/react to this app’s origin (avoid redirects to admin :3001 in dev).
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "http://localhost:3000",
  },
  outputFileTracingRoot: path.join(__dirname, "../../"),
  webpack: (config) => {
    // Ensure monorepo root node_modules is in resolution path (fixes CSS @import in turbo)
    config.resolve.modules = [
      ...(config.resolve.modules || []),
      path.resolve(__dirname, "../../node_modules"),
    ];
    return config;
  },
  images: {
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "3001",
        pathname: "/uploads/**",
      },
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
        pathname: "/**",
      },
      // R2 S3 endpoint (fallback; set NEXT_PUBLIC_R2_PUBLIC_URL for public URLs to avoid 400)
      { protocol: "https", hostname: "10249571bfc72d7eb7816158e9d29a34.r2.cloudflarestorage.com", pathname: "/**" },
      // R2 public URL – set NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-xxx.r2.dev for working images
      ...getR2ImagePattern(),
    ],
  },
};

export default nextConfig;
