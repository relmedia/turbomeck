import type { NextConfig } from "next";
import path from "path";

const clientPublicUrl = process.env.NEXTAUTH_URL?.trim() || process.env.AUTH_URL?.trim();
if (clientPublicUrl) {
  process.env.AUTH_URL = clientPublicUrl;
  process.env.NEXTAUTH_URL = clientPublicUrl;
  process.env.PUBLIC_AUTH_ORIGIN = clientPublicUrl;
} else if (process.env.NODE_ENV === "development") {
  process.env.PUBLIC_AUTH_ORIGIN = "http://localhost:3000";
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

/**
 * Baseline CSP for the storefront: Next.js (inline hydration), Stripe.js / Elements, PostNord widget,
 * Google/Facebook OAuth, optional GA/GTM when consent loads them.
 * See https://docs.stripe.com/security/guide#content-security-policy
 *
 * Third-party cookie warnings in DevTools for scripts inside Stripe/iframes (e.g. Rokt) are imposed
 * by the browser on those origins; this header does not remove them.
 */
function buildContentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV !== "production";
  const directives: string[] = [
    "default-src 'self'",
    [
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "https://*.js.stripe.com",
      "https://js.stripe.com",
      "https://maps.googleapis.com",
      "https://devportal.postnord.com",
      "https://*.postnord.com",
      "https://accounts.google.com",
      "https://apis.google.com",
      "https://connect.facebook.net",
      "https://www.googletagmanager.com",
      "https://www.google-analytics.com",
      "https://*.klarna.com",
      "https://*.klarnacdn.net",
    ].join(" "),
    ["style-src 'self' 'unsafe-inline'", "https://fonts.googleapis.com"].join(" "),
    ["font-src 'self' data:", "https://fonts.gstatic.com"].join(" "),
    [
      "connect-src 'self'",
      "https://api.stripe.com",
      "https://*.stripe.com",
      "https://*.stripe.network",
      "https://*.js.stripe.com",
      "https://maps.googleapis.com",
      "https://devportal.postnord.com",
      "https://*.postnord.com",
      "https://accounts.google.com",
      "https://apis.google.com",
      "https://graph.facebook.com",
      "https://www.facebook.com",
      "https://connect.facebook.net",
      "https://www.google-analytics.com",
      "https://www.googletagmanager.com",
      "https://region1.google-analytics.com",
      "https://analytics.google.com",
      "https://*.klarna.com",
      "https://*.klarnacdn.net",
    ].join(" "),
    [
      "frame-src 'self'",
      "https://*.js.stripe.com",
      "https://js.stripe.com",
      "https://hooks.stripe.com",
      "https://m.stripe.com",
      "https://checkout.stripe.com",
      "https://*.postnord.com",
      "https://accounts.google.com",
      "https://www.facebook.com",
      "https://*.klarna.com",
    ].join(" "),
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    [
      "form-action 'self'",
      "https://*.stripe.com",
      "https://hooks.stripe.com",
      "https://*.klarna.com",
    ].join(" "),
    "worker-src 'self' blob:",
  ];
  directives.push(
    isDev
      ? "img-src 'self' data: blob: https: http:"
      : "img-src 'self' data: blob: https:"
  );
  if (!isDev) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

function securityHeaders(): { key: string; value: string }[] {
  return [
    { key: "X-DNS-Prefetch-Control", value: "on" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    },
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy() },
  ];
}

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/sanitize-html"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },
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
    NEXTAUTH_URL: clientPublicUrl || "http://localhost:3000",
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
