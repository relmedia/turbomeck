/**
 * Reprint an already-booked label by parcel id.
 *
 * This is the *non-destructive* label endpoint. The other one,
 * `/v3/edi/labels/pdf`, takes an EDI instruction and is book-and-print: posting
 * to it registers a new parcel every time. `/v3/labels/ids/pdf` takes ids
 * instead and only renders a label PostNord already holds, so it can be called
 * as often as needed.
 *
 * It requires the parcel to have been booked with `storeLabel=true`; without
 * that PostNord answers `status: "FAIL"` with `"id not found"` even though the
 * parcel exists.
 */

import { getPostNordBearerTokenNullable } from "./postnord-oauth";
import { describePostNordNetworkError } from "./postnord-fetch-errors";
import { postnordFetch } from "./postnord-node-dns";
import type { PostNordLabelPrintSettings } from "./postnord-booking-edi";

export type StoredLabelResult =
  | { ok: true; body: ArrayBuffer }
  | { ok: false; status: number; message: string; details?: string };

function labelsHost(): string {
  return process.env.POSTNORD_USE_TEST_API === "true"
    ? "atapi2.postnord.com"
    : (process.env.POSTNORD_API_HOST ?? "api2.postnord.com").replace(/^https?:\/\//, "");
}

export async function fetchStoredLabelById(
  parcelId: string,
  settings: PostNordLabelPrintSettings = {},
): Promise<StoredLabelResult> {
  const apiKey = process.env.POSTNORD_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 503, message: "POSTNORD_API_KEY är inte satt" };
  }

  const url = new URL(`https://${labelsHost()}/rest/shipment/v3/labels/ids/pdf`);
  url.searchParams.set("apikey", apiKey);
  if (settings.paperSize) url.searchParams.set("paperSize", settings.paperSize);
  if (settings.rotate) url.searchParams.set("rotate", settings.rotate);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  try {
    const bearer = await getPostNordBearerTokenNullable();
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
  } catch {
    /* the endpoint authenticates on apikey; a missing bearer is not fatal */
  }

  // labelType rides in the body, per PostNord's `labels_ids_request` shape.
  const body = JSON.stringify([
    settings.labelType ? { id: parcelId, labelType: settings.labelType } : { id: parcelId },
  ]);

  let res: Response;
  try {
    res = await postnordFetch(url.toString(), { method: "POST", headers, body });
  } catch (e) {
    return {
      ok: false,
      status: 503,
      message: describePostNordNetworkError("Etikett-ompryck", e),
    };
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      ok: false,
      status: res.status,
      message: "PostNord svarade med något annat än JSON vid ompryck.",
      details: text.slice(0, 2000),
    };
  }

  /**
   * A 200 does not mean success here: PostNord reports per-parcel failures
   * inside the body, so `"id not found"` arrives with HTTP 200.
   */
  const entries = Array.isArray(json) ? json : [json];
  for (const entry of entries) {
    const row = entry as Record<string, unknown>;
    const items = row.itemIds;
    if (Array.isArray(items)) {
      for (const it of items) {
        const item = it as Record<string, unknown>;
        if (String(item.status ?? "").toUpperCase() === "FAIL") {
          const msg =
            (item.errorResponse as { message?: string } | undefined)?.message ??
            "Okänt fel";
          return {
            ok: false,
            status: 409,
            message:
              msg === "id not found"
                ? "PostNord har ingen sparad etikett för kollinumret. Bokningar gjorda innan etikettlagring slogs på kan bara skrivas ut i sitt ursprungliga format."
                : `PostNord: ${msg}`,
          };
        }
      }
    }

    const printout = (row.printout ?? (row.labelPrintout as Array<Record<string, unknown>> | undefined)?.[0]?.printout) as
      | Record<string, unknown>
      | undefined;
    const data = printout?.data;
    if (typeof data === "string" && data.length > 0) {
      const encoding = String(printout?.encoding ?? "base64").toLowerCase();
      const buf =
        encoding === "base64"
          ? Buffer.from(data, "base64")
          : Buffer.from(data, "utf8");
      return {
        ok: true,
        body: buf.buffer.slice(
          buf.byteOffset,
          buf.byteOffset + buf.byteLength,
        ) as ArrayBuffer,
      };
    }
  }

  console.error("[postnord-label-reprint] no printout in response", {
    status: res.status,
    body: text.slice(0, 1500),
  });
  return {
    ok: false,
    status: 502,
    message: "PostNord returnerade ingen etikett vid ompryck.",
    details: text.slice(0, 2000),
  };
}
