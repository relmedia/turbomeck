import type { NextRequest } from "next/server";

const SHOP_APEX = new Set(["turbomeck.cloud", "www.turbomeck.cloud"]);

function studioHostname(): string {
  return process.env.ADMIN_STUDIO_HOSTNAME?.trim() || "studio.turbomeck.cloud";
}

/** If .env still points at shop apex, magic links must use studio host. */
function normalizeCanonical(url: string): string {
  const t = url.trim().replace(/\/$/, "");
  try {
    const u = new URL(t);
    if (SHOP_APEX.has(u.hostname)) {
      u.hostname = new URL(`https://${studioHostname()}`).hostname;
      return u.origin;
    }
    return u.origin;
  } catch {
    return t;
  }
}

/**
 * Auth.js reads AUTH_URL / NEXTAUTH_URL while handling this request. Sync from disk env first,
 * then fall back to Host headers so email callbacks always match studio.turbomeck.cloud.
 */
export function syncAuthPublicUrlFromRequest(req: NextRequest): void {
  let canonical = (
    process.env.ADMIN_CANONICAL_ORIGIN ||
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    ""
  ).trim();

  if (!canonical) {
    const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "")
      .split(",")[0]
      ?.trim();
    if (host) {
      let proto =
        (req.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
      if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
        proto = "http";
      }
      canonical = `${proto}://${host}`;
    }
  }

  if (!canonical) return;

  canonical = normalizeCanonical(canonical);
  process.env.AUTH_URL = canonical;
  process.env.NEXTAUTH_URL = canonical;
  process.env.PUBLIC_AUTH_ORIGIN = canonical;
}
