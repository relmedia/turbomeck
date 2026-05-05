/**
 * Server-side helper that builds the payload for and calls PostNord's Delivery
 * Options API – the same endpoint powering checkout-showroom.postnord.com.
 *
 * Endpoint (per the OpenAPI spec at developer.postnord.com,
 * systemName=shipment-v1-deliveryoptions):
 *   POST {host}/rest/shipment/v1/deliveryoptions/bywarehouse?apikey=<KEY>
 *     - host = api2.postnord.com    (production)
 *     - host = atapi2.postnord.com  when POSTNORD_USE_TEST_API=true (sandbox)
 *
 * Auth model: simple API key in the `apikey` query parameter (`iamRequired:false`).
 * Production and sandbox keys are NOT interchangeable – sandbox needs its own
 * key from PostNord. Without a valid key the gateway responds 403 (sandbox) or
 * 404 (prod).
 *
 * Configuration via env (apps/client/.env):
 *   POSTNORD_API_KEY                – mandatory apikey for the PostNord REST gateway
 *   POSTNORD_USE_TEST_API=true      – switch to atapi2.postnord.com (sandbox)
 *   POSTNORD_API_HOST               – override host (default api2.postnord.com)
 *   POSTNORD_DELIVERY_OPTIONS_URL   – full override URL (used as-is when set)
 *   POSTNORD_CUSTOMER_KEY           – customer.customerKey (your PostNord customer id).
 *                                     Falls back to POSTNORD_EDI_CUSTOMER_NUMBER when unset.
 *   POSTNORD_WAREHOUSE_*            – default warehouse (sender) address used
 *                                     when the caller does not pass `warehouses`.
 *
 * Validation rules enforced upstream that we mirror here:
 *   - `warehouses[].orderHandling.timeOfLatestOrder` MUST be today (PostNord
 *     rejects past or future dates with API-008).
 *
 * The function returns BOTH the request payload and the upstream JSON, so the
 * checkout UI can mirror the “API anrop / API svar” debug view from PostNord docs.
 */

import type {
  PostNordAddress,
  PostNordDeliveryOptionsRequest,
  PostNordDeliveryOptionsResponse,
  PostNordDeliveryType,
  PostNordWarehouse,
} from "./postnord-delivery-options-types";

const DEFAULT_DELIVERY_TYPES: PostNordDeliveryType[] = [
  "home",
  "parcel-locker",
  "service-point",
  "mailbox",
  "express-mailbox",
  "groupage",
  "international-parcel",
];

function getApiHost(): string {
  return process.env.POSTNORD_USE_TEST_API === "true"
    ? "atapi2.postnord.com"
    : (process.env.POSTNORD_API_HOST?.trim() || "api2.postnord.com");
}

export function getDeliveryOptionsUrl(): string {
  const override = process.env.POSTNORD_DELIVERY_OPTIONS_URL?.trim();
  if (override) return override;
  return `https://${getApiHost()}/rest/shipment/v1/deliveryoptions/bywarehouse`;
}

function nonEmpty(...values: Array<string | undefined | null>): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Normalises an `Accept-Language` value for the Delivery Options API.
 * PostNord supports `sv` and `en` (default `en`). We default to Swedish so
 * the checkout descriptions render in Swedish; any unsupported language tag
 * falls back to Swedish too.
 */
function normalizeLanguage(value: string | null | undefined): string {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return "sv";
  const primary = raw.split(/[-_]/)[0];
  if (primary === "en") return "en";
  return "sv";
}

function extractUpstreamMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const top = data as Record<string, unknown>;
  if (typeof top.message === "string" && top.message.trim()) return top.message.trim();
  const err = top.error as Record<string, unknown> | undefined;
  if (err && typeof err === "object") {
    if (typeof err.message === "string" && err.message.trim()) return err.message.trim();
    if (typeof err.error_type === "string" && err.error_type.trim()) return err.error_type.trim();
  }
  const composite = top.compositeFault as Record<string, unknown> | undefined;
  if (composite && typeof composite === "object" && typeof composite.message === "string") {
    return composite.message.trim() || null;
  }
  return null;
}

/**
 * Builds the default sender warehouse address from POSTNORD_WAREHOUSE_* /
 * POSTNORD_CONSIGNOR_* env vars. Returns null when not enough fields are set.
 */
export function getDefaultWarehouse(): PostNordWarehouse | null {
  const streetName = nonEmpty(
    process.env.POSTNORD_WAREHOUSE_STREET_NAME,
    process.env.POSTNORD_WAREHOUSE_STREET,
    process.env.POSTNORD_CONSIGNOR_STREET,
  );
  const streetNumber = nonEmpty(
    process.env.POSTNORD_WAREHOUSE_STREET_NUMBER,
    process.env.POSTNORD_CONSIGNOR_STREET_NUMBER,
  );
  const postCode = nonEmpty(
    process.env.POSTNORD_WAREHOUSE_POST_CODE,
    process.env.POSTNORD_WAREHOUSE_POSTAL_CODE,
    process.env.POSTNORD_CONSIGNOR_POSTAL_CODE,
  );
  const city = nonEmpty(
    process.env.POSTNORD_WAREHOUSE_CITY,
    process.env.POSTNORD_CONSIGNOR_CITY,
  );
  const countryCode =
    nonEmpty(
      process.env.POSTNORD_WAREHOUSE_COUNTRY_CODE,
      process.env.POSTNORD_WAREHOUSE_COUNTRY,
      process.env.POSTNORD_CONSIGNOR_COUNTRY,
    ) ?? "SE";

  if (!streetName || !postCode || !city) return null;

  const id = nonEmpty(process.env.POSTNORD_WAREHOUSE_ID) ?? "1";
  const cutoffEnv = nonEmpty(process.env.POSTNORD_WAREHOUSE_LATEST_ORDER_TIME);

  return {
    id,
    address: {
      streetName,
      ...(streetNumber ? { streetNumber } : {}),
      postCode,
      city,
      countryCode,
    },
    orderHandling: {
      timeOfLatestOrder: cutoffEnv ?? defaultLatestOrderToday(),
    },
  };
}

/**
 * Returns an ISO timestamp that PostNord will accept for
 * `warehouses[].orderHandling.timeOfLatestOrder`.
 *
 * PostNord rejects any date other than today (faultCode API-008), so we always
 * anchor to today’s date in the warehouse’s local time (Europe/Stockholm by
 * default). Default cut-off is 18:00 local; if 18:00 has already passed we
 * push forward to 23:59 the same day to keep the date on today.
 */
function defaultLatestOrderToday(): string {
  const now = new Date();
  const stockholmParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    stockholmParts.find((p) => p.type === type)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const past18 = hour > 18 || (hour === 18 && minute > 0);
  const time = past18 ? "23:59:00" : "18:00:00";
  // Stockholm uses UTC+1 (CET) or UTC+2 (CEST). Use Intl to determine the
  // current offset so the timestamp stays anchored to TODAY in Stockholm.
  const offset = stockholmOffsetForDate(now);
  return `${date}T${time}${offset}`;
}

function stockholmOffsetForDate(date: Date): string {
  const offsetParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Stockholm",
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  if (offsetParts && /GMT([+-]\d{2}):?(\d{2})/.test(offsetParts)) {
    const m = offsetParts.match(/GMT([+-]\d{2}):?(\d{2})/);
    if (m) return `${m[1]}:${m[2]}`;
  }
  return "+01:00";
}

export type BuildDeliveryOptionsPayloadInput = {
  customerKey?: string;
  warehouses?: PostNordWarehouse[];
  deliveryTypes?: PostNordDeliveryType[];
  recipient: { address: PostNordAddress };
  /**
   * BCP-47 / RFC 4647 language tag for `Accept-Language`. Supported by
   * PostNord: `sv` (Swedish) and `en` (English). Defaults to Swedish so
   * descriptiveTexts / friendlyDeliveryInfo come back translated.
   */
  language?: string;
};

export function buildDeliveryOptionsPayload(
  input: BuildDeliveryOptionsPayloadInput,
): PostNordDeliveryOptionsRequest {
  const customerKey =
    input.customerKey?.trim() ||
    process.env.POSTNORD_CUSTOMER_KEY?.trim() ||
    process.env.POSTNORD_EDI_CUSTOMER_NUMBER?.trim() ||
    "dummy-customer-id";

  let warehouses = (input.warehouses ?? []).filter(Boolean);
  if (warehouses.length === 0) {
    const defaultWarehouse = getDefaultWarehouse();
    if (defaultWarehouse) warehouses = [defaultWarehouse];
  }

  const deliveryTypes =
    input.deliveryTypes && input.deliveryTypes.length > 0
      ? input.deliveryTypes
      : DEFAULT_DELIVERY_TYPES;

  return {
    customer: { customerKey },
    warehouses,
    filter: { deliveryTypes },
    recipient: { address: input.recipient.address },
  };
}

export type FetchPostNordDeliveryOptionsResult =
  | {
      ok: true;
      requestUrl: string;
      requestPayload: PostNordDeliveryOptionsRequest;
      data: PostNordDeliveryOptionsResponse;
    }
  | {
      ok: false;
      requestUrl: string;
      requestPayload: PostNordDeliveryOptionsRequest;
      status: number;
      error: string;
      data: unknown;
    };

export async function fetchPostNordDeliveryOptions(
  input: BuildDeliveryOptionsPayloadInput,
): Promise<FetchPostNordDeliveryOptionsResult> {
  const apiKey = process.env.POSTNORD_API_KEY?.trim();
  if (!apiKey || apiKey === "your_postnord_api_key_here") {
    return {
      ok: false,
      requestUrl: getDeliveryOptionsUrl(),
      requestPayload: buildDeliveryOptionsPayload(input),
      status: 503,
      error: "POSTNORD_API_KEY saknas — sätt den i apps/client/.env.",
      data: null,
    };
  }

  const requestPayload = buildDeliveryOptionsPayload(input);
  if (requestPayload.warehouses.length === 0) {
    return {
      ok: false,
      requestUrl: getDeliveryOptionsUrl(),
      requestPayload,
      status: 400,
      error:
        "Ingen avsändar­adress (warehouse) konfigurerad. Sätt POSTNORD_WAREHOUSE_STREET_NAME / POSTAL_CODE / CITY i apps/client/.env eller skicka warehouses i requesten.",
      data: null,
    };
  }

  const url = new URL(getDeliveryOptionsUrl());
  url.searchParams.set("apikey", apiKey);
  const requestUrl = url.toString();

  const language = normalizeLanguage(
    input.language ?? process.env.POSTNORD_DELIVERY_OPTIONS_LANGUAGE,
  );

  try {
    const res = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Language": language,
      },
      body: JSON.stringify(requestPayload),
    });

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const upstreamMessage = extractUpstreamMessage(data);
      let friendly: string;
      if (res.status === 404) {
        friendly = upstreamMessage
          ? `PostNord 404: ${upstreamMessage}. Kontrollera att POSTNORD_API_KEY har behörighet till shipment-v1-deliveryoptions, eller sätt POSTNORD_USE_TEST_API=true om nyckeln är en sandbox-nyckel.`
          : `PostNord 404: endpointen hittades inte. Verifiera att POSTNORD_API_KEY har tillgång till Delivery Options API:t (shipment-v1-deliveryoptions) eller växla till sandbox via POSTNORD_USE_TEST_API=true.`;
      } else if (res.status === 401 || res.status === 403) {
        friendly = `PostNord ${res.status}: ${upstreamMessage ?? "API-nyckeln saknar behörighet till Delivery Options API:t"}.`;
      } else {
        friendly = upstreamMessage ?? `PostNord svarade med ${res.status}.`;
      }
      return {
        ok: false,
        requestUrl,
        requestPayload,
        status: res.status,
        error: friendly,
        data,
      };
    }

    return {
      ok: true,
      requestUrl,
      requestPayload,
      data: data as PostNordDeliveryOptionsResponse,
    };
  } catch (err) {
    return {
      ok: false,
      requestUrl,
      requestPayload,
      status: 502,
      error:
        err instanceof Error
          ? `PostNord-anrop misslyckades: ${err.message}`
          : "PostNord-anrop misslyckades.",
      data: null,
    };
  }
}
