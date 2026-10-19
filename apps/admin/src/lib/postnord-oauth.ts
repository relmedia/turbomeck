/**
 * PostNord OAuth2 client credentials — optional addition to POSTNORD_API_KEY (apikey query param stays required).
 * @see https://postnord-ab-production.3scale.net/api/docs/general-information
 *
 * As of 2026 the documented production token host `gate.ess.postnord.com` resolves to a deleted
 * AWS ELB (NXDOMAIN). If your booking plan does not require IAM, set POSTNORD_SKIP_OAUTH=true
 * (or simply don’t set POSTNORD_CLIENT_ID). Use POSTNORD_OAUTH_TOKEN_URL=… when PostNord moves it.
 */

import { describePostNordNetworkError } from "./postnord-fetch-errors";
import { postnordFetch } from "./postnord-node-dns";

let cachedToken: { key: string; value: string; expiresAtMs: number } | null = null;

/**
 * Last-warning timestamp rather than a one-shot boolean.
 *
 * A `warnedAboutOAuthFallback` flag meant the first failure in a process warned
 * and every booking after it failed in total silence — which is why a server
 * that has been up for a day shows nothing at all about a broken token host.
 * Re-warn at most every 5 minutes so a repeated failure stays visible without
 * flooding the log.
 */
let lastOAuthWarnAtMs = 0;
const OAUTH_WARN_INTERVAL_MS = 5 * 60_000;

/** What actually happened last time we tried, for the config-status endpoint. */
let oauthDiagnostics: {
  lastAttemptAt: string | null;
  lastError: string | null;
  lastTokenAt: string | null;
} = { lastAttemptAt: null, lastError: null, lastTokenAt: null };

function warnOAuth(message: string): void {
  const now = Date.now();
  if (now - lastOAuthWarnAtMs < OAUTH_WARN_INTERVAL_MS) return;
  lastOAuthWarnAtMs = now;
  console.warn(`[postnord-oauth] ${message}`);
}

/**
 * The token endpoint this process would use.
 *
 * Exported so `postnord-config-status.ts` reports the same URL the request
 * would actually hit — two copies of this logic would drift and the status
 * panel would then confidently describe a host we never call.
 */
export function postnordOAuthTokenUrl(): string {
  const override = process.env.POSTNORD_OAUTH_TOKEN_URL?.trim();
  if (override) return override;
  const sandbox = process.env.POSTNORD_USE_TEST_API === "true";
  return sandbox
    ? "https://pp-gate.ess.postnord.com/mga/sps/oauth/oauth20/token"
    : "https://gate.ess.postnord.com/mga/sps/oauth/oauth20/token";
}

function isOn(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * Both documented token hosts were decommissioned; a request to either fails
 * DNS resolution before it is even sent. Used to tell an operator that the
 * default is dead rather than letting them read a generic network error.
 */
const DEAD_TOKEN_HOSTS = ["gate.ess.postnord.com", "pp-gate.ess.postnord.com"];

/** True when this process would call a token host that no longer resolves. */
export function postnordOAuthUsesDeadHost(): boolean {
  const url = postnordOAuthTokenUrl();
  return DEAD_TOKEN_HOSTS.some((h) => url.includes(h));
}

export function getPostNordOAuthDiagnostics(): {
  tokenUrl: string;
  skipped: boolean;
  required: boolean;
  usesDeadHost: boolean;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastTokenAt: string | null;
} {
  return {
    tokenUrl: postnordOAuthTokenUrl(),
    skipped: isOn("POSTNORD_SKIP_OAUTH"),
    required: isOn("POSTNORD_OAUTH_REQUIRED"),
    usesDeadHost: postnordOAuthUsesDeadHost(),
    ...oauthDiagnostics,
  };
}

/**
 * Returns a Bearer access token when POSTNORD_CLIENT_ID is set.
 * Returns null and logs a warning when:
 *   - OAuth is explicitly skipped (POSTNORD_SKIP_OAUTH=true), or
 *   - The token endpoint cannot be reached and POSTNORD_OAUTH_REQUIRED is not true.
 * Throws only when IAM is explicitly required (POSTNORD_OAUTH_REQUIRED=true) and we couldn't get a token.
 *
 * POSTNORD_API_KEY (apikey query param) is unrelated to OAuth and is still required for REST calls.
 */
export async function getPostNordBearerTokenNullable(): Promise<string | null> {
  if (isOn("POSTNORD_SKIP_OAUTH")) return null;

  const clientId = process.env.POSTNORD_CLIENT_ID?.trim();
  const clientSecret = process.env.POSTNORD_CLIENT_SECRET?.trim();
  if (!clientId) return null;

  const now = Date.now();
  /** Avoid reusing token if switching between secret / no-secret. */
  const cacheKey = `${clientId}:${clientSecret ? "with_secret" : "no_secret"}`;
  if (cachedToken?.key === cacheKey && cachedToken.expiresAtMs > now + 15_000) {
    return cachedToken.value;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
  });
  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }
  const scope = process.env.POSTNORD_OAUTH_SCOPE?.trim();
  if (scope) body.set("scope", scope);

  const tokenUrl = postnordOAuthTokenUrl();
  const oauthRequired = isOn("POSTNORD_OAUTH_REQUIRED");
  oauthDiagnostics = { ...oauthDiagnostics, lastAttemptAt: new Date().toISOString() };

  let res: Response;
  try {
    res = await postnordFetch(tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  } catch (e) {
    const msg = describePostNordNetworkError("OAuth token", e);
    oauthDiagnostics = { ...oauthDiagnostics, lastError: msg };
    if (oauthRequired) throw new Error(msg);
    warnOAuth(
      `${msg} — fortsätter utan Bearer (sätt POSTNORD_OAUTH_REQUIRED=true för att tvinga, eller POSTNORD_SKIP_OAUTH=true för att tysta).` +
        (postnordOAuthUsesDeadHost()
          ? ` OBS: ${tokenUrl} är en avvecklad värd (NXDOMAIN) — Booking-API:t använder apikey, så POSTNORD_SKIP_OAUTH=true är rätt svar här.`
          : ""),
    );
    return null;
  }

  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok) {
    const message = `PostNord OAuth (${res.status}): ${json?.error_description ?? json?.error ?? "token request failed"}`;
    oauthDiagnostics = { ...oauthDiagnostics, lastError: message };
    if (oauthRequired) throw new Error(message);
    warnOAuth(`${message} — fortsätter utan Bearer.`);
    return null;
  }

  const token = typeof json.access_token === "string" ? json.access_token : null;
  if (!token) {
    if (oauthRequired) throw new Error("PostNord OAuth: response missing access_token");
    return null;
  }

  const expiresInSec = typeof json.expires_in === "number" && json.expires_in > 0 ? json.expires_in : 3600;
  cachedToken = { key: cacheKey, value: token, expiresAtMs: now + expiresInSec * 1000 - 60_000 };
  oauthDiagnostics = {
    ...oauthDiagnostics,
    lastError: null,
    lastTokenAt: new Date().toISOString(),
  };

  return token;
}
