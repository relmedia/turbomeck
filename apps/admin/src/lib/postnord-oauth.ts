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
let warnedAboutOAuthFallback = false;

function postnordOAuthTokenUrl(): string {
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
    if (oauthRequired) throw new Error(msg);
    if (!warnedAboutOAuthFallback) {
      warnedAboutOAuthFallback = true;
      console.warn(
        `[postnord-oauth] ${msg} — fortsätter utan Bearer (sätt POSTNORD_OAUTH_REQUIRED=true för att tvinga, eller POSTNORD_SKIP_OAUTH=true för att tysta).`,
      );
    }
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
    if (oauthRequired) throw new Error(message);
    if (!warnedAboutOAuthFallback) {
      warnedAboutOAuthFallback = true;
      console.warn(`[postnord-oauth] ${message} — fortsätter utan Bearer.`);
    }
    return null;
  }

  const token = typeof json.access_token === "string" ? json.access_token : null;
  if (!token) {
    if (oauthRequired) throw new Error("PostNord OAuth: response missing access_token");
    return null;
  }

  const expiresInSec = typeof json.expires_in === "number" && json.expires_in > 0 ? json.expires_in : 3600;
  cachedToken = { key: cacheKey, value: token, expiresAtMs: now + expiresInSec * 1000 - 60_000 };

  return token;
}
