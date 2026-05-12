/**
 * SECURITY (audit M3): defense-in-depth Origin header check for admin
 * state-changing routes. See apps/client/src/lib/same-origin.ts for the full
 * rationale — this is the admin-app sibling so we can keep the env names
 * separate (admin and storefront live on different hostnames in prod).
 *
 * Allowlist:
 *   - `NEXT_PUBLIC_ADMIN_APP_URL` (preferred)
 *   - `NEXT_PUBLIC_APP_URL` (legacy fallback for single-app deployments)
 *   - `NEXT_PUBLIC_ADMIN_SAME_ORIGIN_ALLOWLIST` (comma-separated extras)
 *   - localhost variants when NODE_ENV !== "production"
 */

import { NextResponse } from "next/server";

function getAllowedOrigins(): string[] {
  const fromAdmin = (process.env.NEXT_PUBLIC_ADMIN_APP_URL || "").trim();
  const fromApp = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  const list = (process.env.NEXT_PUBLIC_ADMIN_SAME_ORIGIN_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults =
    process.env.NODE_ENV === "production"
      ? []
      : [
          "http://localhost:3000",
          "http://localhost:3001",
          "http://localhost:3002",
          "http://localhost:3003",
        ];
  const all = new Set<string>([...defaults, ...list]);
  if (fromAdmin) all.add(fromAdmin.replace(/\/$/, ""));
  if (fromApp) all.add(fromApp.replace(/\/$/, ""));
  return [...all];
}

export function requireSameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) {
    return NextResponse.json(
      { error: "Forbidden: missing Origin header" },
      { status: 403 },
    );
  }
  const allowed = getAllowedOrigins();
  const normalized = origin.replace(/\/$/, "");
  if (!allowed.includes(normalized)) {
    return NextResponse.json(
      { error: "Forbidden: origin not allowed" },
      { status: 403 },
    );
  }
  return null;
}
