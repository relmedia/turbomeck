/**
 * Shared password policy for storefront signup / change-password / reset-password.
 *
 * Rules:
 *   - Minimum 8 characters (was 6 — audit M5)
 *   - Maximum 128 bytes — prevents `bcrypt.hash` burning CPU on multi-MB input,
 *     which would otherwise be a trivial DoS on any password-accepting endpoint.
 *     bcrypt itself silently truncates at 72 bytes; rejecting >128 keeps the
 *     hash function's behavior predictable.
 *   - bcrypt cost factor 12 (was 10). One hash takes ~100–300 ms on a modest
 *     CPU which is the right cost for 2026.
 */

/** Recommended bcrypt cost factor for new password hashes. */
export const BCRYPT_COST = 12;

const MIN_LENGTH = 8;
const MAX_BYTES = 128;

export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Returns ok or a customer-facing Swedish error message that callers can
 * forward to the client verbatim. Keep the error wording in sync with the
 * registration / reset UIs.
 */
export function validatePassword(pw: unknown): PasswordPolicyResult {
  if (typeof pw !== "string") {
    return { ok: false, error: "Lösenord saknas" };
  }
  if (pw.length < MIN_LENGTH) {
    return { ok: false, error: `Lösenordet måste vara minst ${MIN_LENGTH} tecken` };
  }
  // Byte length, not char length — guards against gigabyte UTF-8 passwords.
  const bytes = Buffer.byteLength(pw, "utf8");
  if (bytes > MAX_BYTES) {
    return {
      ok: false,
      error: `Lösenordet är för långt (max ${MAX_BYTES} byte)`,
    };
  }
  return { ok: true };
}
