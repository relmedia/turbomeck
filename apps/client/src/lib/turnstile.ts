import { NextResponse } from "next/server";
import { clientIpFromHeaders } from "@repo/auth/client-ip";

/**
 * Cloudflare Turnstile verification for the unauthenticated, mail-sending
 * endpoints (sign-up, magic link, password reset).
 *
 * Rate limits cap how fast one client can hit those endpoints; the challenge is
 * what makes a distributed script expensive. Both are needed: limits alone are
 * defeated by renting more IPs, a challenge alone by solving it once and
 * replaying — Turnstile tokens are single-use, which closes that.
 *
 * Posture: when `TURNSTILE_SECRET_KEY` is unset we skip verification entirely,
 * so local dev and any deploy that hasn't been given keys keep working. Once
 * the key IS set we fail closed, including when Cloudflare is unreachable — a
 * CAPTCHA that silently passes on error is not a control.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** True when this deployment has been configured to require a challenge. */
export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

type TurnstileVerifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

/**
 * Returns `null` when the request may proceed, or a 403 response to return
 * as-is. Mirrors the shape of `requireSameOrigin` so route handlers read the
 * same way: `const denied = await requireTurnstile(req, token); if (denied) return denied;`
 */
export async function requireTurnstile(
  request: Request,
  token: unknown,
): Promise<NextResponse | null> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return null;

  if (typeof token !== "string" || !token.trim()) {
    return NextResponse.json(
      { error: "Verifiering krävs. Ladda om sidan och försök igen." },
      { status: 403 },
    );
  }

  const body = new URLSearchParams({ secret, response: token.trim() });
  const remoteip = clientIpFromHeaders(request.headers);
  if (remoteip !== "unknown") body.set("remoteip", remoteip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      // Don't let a slow Cloudflare hang a customer's sign-up request.
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as TurnstileVerifyResponse;
    if (data.success === true) return null;
    console.warn("[turnstile] verification failed", data["error-codes"]);
  } catch (err) {
    console.error("[turnstile] verification request failed", err);
  }

  return NextResponse.json(
    { error: "Verifiering misslyckades. Försök igen." },
    { status: 403 },
  );
}
