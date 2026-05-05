/**
 * PostNord OAuth2 client credentials — optional addition to POSTNORD_API_KEY (apikey query param stays required).
 * @see https://postnord-ab-production.3scale.net/api/docs/general-information
 */

import { describePostNordNetworkError } from "./postnord-fetch-errors";
import { postnordFetch } from "./postnord-node-dns";

let cachedToken: { key: string; value: string; expiresAtMs: number } | null = null;

function postnordOAuthTokenUrl(): string {
  const override = process.env.POSTNORD_OAUTH_TOKEN_URL?.trim();
  if (override) return override;
  const sandbox = process.env.POSTNORD_USE_TEST_API === "true";
  return sandbox
    ? "https://pp-gate.ess.postnord.com/mga/sps/oauth/oauth20/token"
    : "https://gate.ess.postnord.com/mga/sps/oauth/oauth20/token";
}

/**
 * Returns a Bearer access token when POSTNORD_CLIENT_ID is set.
 * POSTNORD_CLIENT_SECRET is omitted from the token request unless set (sandbox often uses client_id only).
 * Still send POSTNORD_API_KEY on REST calls — OAuth is additive for IAM endpoints.
 */
export async function getPostNordBearerTokenNullable(): Promise<string | null> {
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
    throw new Error(describePostNordNetworkError("OAuth token", e));
  }

  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok) {
    throw new Error(
      `PostNord OAuth (${res.status}): ${json?.error_description ?? json?.error ?? "token request failed"}`
    );
  }

  const token = typeof json.access_token === "string" ? json.access_token : null;
  if (!token) {
    throw new Error("PostNord OAuth: response missing access_token");
  }

  const expiresInSec = typeof json.expires_in === "number" && json.expires_in > 0 ? json.expires_in : 3600;
  cachedToken = { key: cacheKey, value: token, expiresAtMs: now + expiresInSec * 1000 - 60_000 };

  return token;
}
