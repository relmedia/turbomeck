import { createHash } from "crypto";

/**
 * Password-reset tokens are stored as a SHA-256 hash of the value that went out
 * in the email, so the `password_reset_token` table holds nothing usable on its
 * own (a leaked backup or a read-only SQL injection no longer hands over a
 * working reset link).
 *
 * Plain SHA-256 rather than bcrypt on purpose: the token is 32 bytes of
 * `randomBytes` entropy, so there is no dictionary to stretch against, and the
 * lookup is an indexed equality match on every reset attempt.
 *
 * NOTE for deployment: existing rows hold plaintext tokens and will no longer
 * match. They expire within the hour; anyone mid-reset just requests a new link.
 */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}
