/**
 * The sign-up form collects a display name and a terms/privacy acceptance
 * before any account exists — `/api/auth/sign-up` deliberately does not write a
 * `user` row, because the Auth.js adapter creates it when the magic link is
 * verified, and a row written earlier would be an unverified squat on somebody
 * else's address (it also blocks later Google sign-in for that address, since
 * `allowDangerousEmailAccountLinking` is off).
 *
 * So both values are parked in a short-lived HttpOnly cookie and claimed on the
 * first authenticated read (`/api/user/me`). If the customer opens the magic
 * link on a different device the cookie is absent and the name simply stays
 * empty — they can set it in account settings. Nothing security-relevant rides
 * on this cookie: the worst a user can do by forging it is name their own
 * account.
 */

export const PENDING_PROFILE_COOKIE = "tm_pending_profile";

/** An hour is plenty — the magic link itself expires in 15 minutes. */
export const PENDING_PROFILE_MAX_AGE_SEC = 60 * 60;

export type PendingProfile = {
  name?: string;
  /** ISO timestamp of the acceptance. */
  termsAcceptedAt: string;
};

export function serializePendingProfile(profile: PendingProfile): string {
  return JSON.stringify(profile);
}

export function parsePendingProfile(raw: string | undefined): PendingProfile | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const { name, termsAcceptedAt } = parsed as Record<string, unknown>;
    if (typeof termsAcceptedAt !== "string" || !termsAcceptedAt) return null;
    return {
      ...(typeof name === "string" && name.trim()
        ? { name: name.trim().slice(0, 80) }
        : {}),
      termsAcceptedAt,
    };
  } catch {
    return null;
  }
}
