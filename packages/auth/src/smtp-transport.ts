/**
 * Shared nodemailer transport builder used by:
 *   - @repo/auth magic-link sender (this package)
 *   - admin /api/settings/mail/test
 *   - admin /api/settings/mail/send-test
 *
 * Handles the “shared SMTP server” pattern (Inleed, Loopia, One.com, cPanel) where the
 * connection host is a vanity name (e.g. smtp.example.com) but the TLS cert is issued to
 * the underlying physical host (e.g. prime4.inleed.net). Set `tlsServername` to the cert
 * name and the connection succeeds with full verification.
 */

import nodemailer, { type Transporter } from "nodemailer";

export type MailTransportConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  /** Override the TLS SNI / cert verification name (not the TCP host). */
  tlsServername?: string;
  /** Disable certificate verification. Last resort — prefer tlsServername. */
  rejectUnauthorized?: boolean;
};

function isOn(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function isOff(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "false" || v === "0" || v === "no";
}

/** Merge env overrides into a saved/static config (env wins for the TLS knobs only). */
export function applyEnvTlsOverrides(cfg: MailTransportConfig): MailTransportConfig {
  const envServername = process.env.SMTP_TLS_SERVERNAME?.trim();
  const out: MailTransportConfig = { ...cfg };
  if (envServername) out.tlsServername = envServername;
  if (isOff("SMTP_REJECT_UNAUTHORIZED")) out.rejectUnauthorized = false;
  if (isOn("SMTP_REJECT_UNAUTHORIZED")) out.rejectUnauthorized = true;
  return out;
}

export function buildSmtpTransport(cfg: MailTransportConfig): Transporter {
  const merged = applyEnvTlsOverrides(cfg);
  const tls: Record<string, unknown> = {};
  if (merged.tlsServername) tls.servername = merged.tlsServername;
  if (merged.rejectUnauthorized === false) tls.rejectUnauthorized = false;

  return nodemailer.createTransport({
    host: merged.host,
    port: merged.port || 587,
    secure: merged.secure,
    auth: merged.user ? { user: merged.user, pass: merged.password } : undefined,
    tls: Object.keys(tls).length > 0 ? tls : undefined,
  });
}
