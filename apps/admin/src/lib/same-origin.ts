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

/** Reduce a configured URL to a bare origin; ignore anything unparseable. */
function originOf(raw: string | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  try {
    return new URL(t).origin;
  } catch {
    // Tolerate a value written without a scheme rather than dropping it.
    try {
      return new URL(`https://${t}`).origin;
    } catch {
      return null;
    }
  }
}

let warnedEmpty = false;

function getAllowedOrigins(): string[] {
  const list = (process.env.NEXT_PUBLIC_ADMIN_SAME_ORIGIN_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => originOf(s))
    .filter((s): s is string => !!s);

  const sources = [
    process.env.NEXT_PUBLIC_ADMIN_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    /**
     * The admin's canonical origin, which deployments already configure for
     * NextAuth. Without these, a production box that sets only AUTH_URL ends
     * up with an EMPTY allowlist — and an empty allowlist rejects everything,
     * so every state-changing route answers "Forbidden: origin not allowed"
     * no matter who calls it. That is a silent outage, not a security win.
     *
     * Read at runtime rather than inlined: unlike the NEXT_PUBLIC_ names
     * above, these are ordinary server env vars, so a value added to .env
     * takes effect on restart without a rebuild.
     */
    process.env.ADMIN_CANONICAL_ORIGIN,
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
  ];

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
  for (const src of sources) {
    const origin = originOf(src);
    if (origin) all.add(origin);
  }

  if (all.size === 0 && !warnedEmpty) {
    warnedEmpty = true;
    console.error(
      "[same-origin] No allowed origins configured — every state-changing admin " +
        "route will reject with 403. Set NEXT_PUBLIC_ADMIN_APP_URL or AUTH_URL.",
    );
  }
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
