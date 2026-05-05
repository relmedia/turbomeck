/**
 * PostNord Track Shipment API – findByIdentifier (public).
 * @see https://developer.postnord.com/apis/details/YOoaIYIBtTJB9kBCpFRe (portal entry)
 * @see https://developer.postnord.com/apis/details?systemName=shipment-v5-trackandtrace-findbyidentifier-public
 *
 * Production: api2.postnord.com · Sandbox: atapi2.postnord.com
 */

import { getPostNordBearerTokenNullable } from "./postnord-oauth";
import { postnordFetch } from "./postnord-node-dns";

export function getPostNordTrackApiHost(): string {
  return process.env.POSTNORD_USE_TEST_API === "true"
    ? "atapi2.postnord.com"
    : (process.env.POSTNORD_API_HOST ?? "api2.postnord.com");
}

/** REST path version, e.g. v5 (current) or v2 (legacy). */
export function getPostNordTrackShipmentApiVersion(): string {
  const v = process.env.POSTNORD_TRACK_SHIPMENT_VERSION?.trim();
  return v && /^v\d+$/i.test(v) ? v.toLowerCase() : "v5";
}

export function buildPostNordFindByIdentifierUrl(
  trackingId: string,
  locale: string,
  apiKey: string,
  version?: string,
): string {
  const host = getPostNordTrackApiHost();
  const ver = version ?? getPostNordTrackShipmentApiVersion();
  const url = new URL(
    `https://${host}/rest/shipment/${ver}/trackandtrace/findByIdentifier.json`,
  );
  url.searchParams.set("id", trackingId);
  url.searchParams.set("locale", locale);
  url.searchParams.set("apikey", apiKey);
  return url.toString();
}

export type FetchPostNordTrackingResult =
  | { ok: true; data: unknown; versionUsed: string }
  | { ok: false; status: number; data: unknown | null };

/**
 * Fetches tracking JSON. Tries configured version first (default v5), then v2 if the first call is 404.
 */
export async function fetchPostNordTrackingJson(
  trackingId: string,
  locale = "sv",
): Promise<FetchPostNordTrackingResult> {
  const apiKey = process.env.POSTNORD_API_KEY?.trim();
  if (!apiKey || apiKey === "your_postnord_api_key_here") {
    return { ok: false, status: 503, data: { error: "POSTNORD_API_KEY not configured" } };
  }

  let bearer: string | null = null;
  try {
    bearer = await getPostNordBearerTokenNullable();
  } catch (e) {
    if (process.env.POSTNORD_CLIENT_ID?.trim()) {
      return {
        ok: false,
        status: 503,
        data: {
          error: e instanceof Error ? e.message : "PostNord OAuth misslyckades (kontrollera client_id/secret och token-URL)",
        },
      };
    }
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const preferred = getPostNordTrackShipmentApiVersion();
  const chain: string[] =
    preferred === "v2" ? ["v2"] : [preferred, "v2"];

  let lastStatus = 502;
  let lastData: unknown | null = null;

  for (let i = 0; i < chain.length; i++) {
    const ver = chain[i]!;
    const url = buildPostNordFindByIdentifierUrl(trackingId, locale, apiKey, ver);
    const res = await postnordFetch(url, { headers });
    const data = await res.json().catch(() => null);
    lastStatus = res.status;
    lastData = data;
    if (res.ok) {
      return { ok: true, data, versionUsed: ver };
    }
    if (res.status === 404 && i < chain.length - 1) {
      continue;
    }
    break;
  }

  return { ok: false, status: lastStatus >= 500 ? 502 : lastStatus, data: lastData };
}
