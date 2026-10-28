/**
 * Where the shop's logo lives.
 *
 * Its own module purely to keep the dependency graph honest. This is six
 * lines of environment reading, but it used to be imported from `email.ts` —
 * which pulls in nodemailer, the database and the shipping package. The spec
 * builder needs the logo URL and nothing else, and two verification harnesses
 * that import it describe themselves as pure; dragging a mail transport and a
 * database connection behind a `process.env` lookup made that false.
 *
 * Same fix already applied to `escapeHtml` → `email-escape.ts`.
 */

/** Identical to @repo/auth `email-templates.ts` (magic link) LOGO_URL resolution. */
export function getOrderEmailLogoUrl(): string {
  const env = process.env;
  if (env.EMAIL_LOGO_URL) return env.EMAIL_LOGO_URL;
  const r2Base = (env.R2_PUBLIC_URL || env.NEXT_PUBLIC_R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (r2Base) return `${r2Base}/branding/logo.png`;
  const appBase = (env.NEXT_PUBLIC_APP_URL || env.NEXTAUTH_URL || "").replace(/\/$/, "");
  if (appBase) return `${appBase}/logo.png`;
  return "";
}
