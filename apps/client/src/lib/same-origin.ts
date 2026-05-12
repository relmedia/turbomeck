/**
 * SECURITY (audit M3): defense-in-depth Origin/Referer header check for
 * state-changing routes that rely on the NextAuth session cookie.
 *
 * Modern browsers default Auth.js session cookies to `SameSite=Lax`, so naive
 * cross-site `<form>` POSTs are already neutralized. Two reasons we add this
 * anyway:
 *
 * 1. `SameSite=Lax` does NOT block top-level navigations triggered by a GET,
 *    so any state-changing handler that accepts GET (or that an attacker can
 *    coax into accepting via a method override) remains exposed.
 * 2. We accept JSON bodies from `fetch()`, and a misconfigured CORS proxy or
 *    a same-site subdomain compromise can still produce a cross-origin POST
 *    that the browser will send the cookie with.
 *
 * The check itself is intentionally simple: the request must declare an
 * `Origin` header (we don't fall back to `Referer` because it is trivially
 * stripped) and that origin must be one we know. The allowlist defaults to
 * `NEXT_PUBLIC_APP_URL` (the canonical storefront origin) plus localhost for
 * dev. Custom origins can be added via NEXT_PUBLIC_SAME_ORIGIN_ALLOWLIST as a
 * comma-separated list.
 */

import { NextResponse } from "next/server";

function getAllowedOrigins(): string[] {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  const list = (process.env.NEXT_PUBLIC_SAME_ORIGIN_ALLOWLIST || "")
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
  if (fromEnv) all.add(fromEnv.replace(/\/$/, ""));
  return [...all];
}

/**
 * Returns null when the request looks same-origin, otherwise a 403 response.
 * Callers should `if (denied) return denied;` at the top of the handler.
 */
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
