import { auth } from "@repo/auth";
import { NextResponse } from "next/server";

/**
 * Defense-in-depth gate for `apps/admin/src/app/api/**` routes.
 *
 * Background: `apps/admin/src/proxy.ts` already redirects unauthenticated /
 * non-admin requests, so in practice every handler under /api can assume the
 * caller is an admin. But the proxy matcher uses a complex negative lookahead
 * and the routes themselves leak PII (full user list, all orders, coupon
 * codes, dashboard analytics, LLM endpoints, …). The audit H3 / M12 findings
 * called out that an accidental regression to the matcher would silently turn
 * each of those routes into an anonymous data dump.
 *
 * Calling `await requireAdmin()` at the top of every admin handler closes
 * that single-point-of-failure: every handler independently asserts the
 * caller is an admin and short-circuits with 401/403 otherwise.
 */

const allowlistFromEnv = () =>
  (process.env.ADMIN_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function isAdminLike(session: {
  user?: { id?: string | null; email?: string | null; role?: string | null };
} | null): boolean {
  if (!session?.user) return false;
  if (session.user.role === "admin") return true;
  const allow = allowlistFromEnv();
  if (allow.length === 0) return false;
  const id = session.user.id ?? "";
  if (id && allow.includes(id)) return true;
  const email = session.user.email ?? "";
  return !!email && allow.includes(email);
}

export type AdminAuthSession = {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null };
};

export type RequireAdminResult =
  | { ok: true; session: AdminAuthSession }
  | { ok: false; response: NextResponse };

/**
 * Returns `{ ok: true, session }` for admin callers or `{ ok: false, response }`
 * with a ready-to-return 401/403 NextResponse for non-admins. The result is
 * tagged rather than thrown so individual handlers can choose to log /
 * customize the error envelope before returning.
 *
 * Usage:
 *   const gate = await requireAdmin();
 *   if (!gate.ok) return gate.response;
 *   const { session } = gate;
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!isAdminLike(session)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return {
    ok: true,
    session: { user: { id: session.user.id, email: session.user.email, name: session.user.name ?? undefined, role: session.user.role ?? null } },
  };
}
