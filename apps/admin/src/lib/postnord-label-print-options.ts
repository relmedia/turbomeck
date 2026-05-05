/**
 * PostNord Booking API — Print Label Options.
 * @see https://api2.postnord.com/rest/shipment/v3/labels/printoptions/ids
 *
 * Returns the available label types / paper sizes / rotations / printout layouts for one or
 * more shipment IDs, so the admin UI can pick a valid combination before requesting the PDF.
 *
 * Auth: same as Booking API (apikey query param + optional IAM bearer).
 */

import { getPostNordBearerTokenNullable } from "./postnord-oauth";
import { describePostNordNetworkError } from "./postnord-fetch-errors";
import { postnordFetch } from "./postnord-node-dns";

function labelsHost(): string {
  return process.env.POSTNORD_USE_TEST_API === "true"
    ? "atapi2.postnord.com"
    : (process.env.POSTNORD_API_HOST ?? "api2.postnord.com").replace(/^https?:\/\//, "");
}

export type PostNordLabelFormat = "PDF" | "ZPL";
export type PostNordLabelRotate = "0" | "90" | "180" | "270";
export type PostNordLabelDefinePrintout = "ALL" | "LABELSANDCUSTOMSDECLARATIONS";
export type PostNordLabelCustoms = "NONE" | "CUSTOMS_DECLARATION" | "CN22" | "CN23" | string;

export type PostNordLabelPrintOptionsRequestItem = {
  id: string;
  format?: PostNordLabelFormat;
  rotate?: PostNordLabelRotate;
  definePrintout?: PostNordLabelDefinePrintout;
};

export type PostNordLabelPrintoutOption = {
  labelType: string;
  paperSize: string[];
  rotate?: string[];
  definePrintout?: string[];
  customs?: string[];
  format: PostNordLabelFormat | string;
};

export type PostNordLabelPrintOptionsBody = {
  summaryPrintoutLabelOptions?: PostNordLabelPrintoutOption[];
  printoutLabelOptions?: Array<{
    id: string;
    printoutOptions: PostNordLabelPrintoutOption[];
  }>;
};

export type PostNordLabelPrintOptionsResult =
  | { ok: true; data: PostNordLabelPrintOptionsBody; raw: unknown }
  | { ok: false; status: number; message: string; details?: string };

/** Normalize a list of plain ids/strings into the request item shape. */
export function normalizePrintOptionsItems(
  ids: Array<string | PostNordLabelPrintOptionsRequestItem>,
  defaults: Partial<Omit<PostNordLabelPrintOptionsRequestItem, "id">> = {},
): PostNordLabelPrintOptionsRequestItem[] {
  const fmt: PostNordLabelFormat = defaults.format ?? "PDF";
  const rot: PostNordLabelRotate = defaults.rotate ?? "0";
  const dp: PostNordLabelDefinePrintout = defaults.definePrintout ?? "ALL";
  const out: PostNordLabelPrintOptionsRequestItem[] = [];
  for (const entry of ids) {
    const id = typeof entry === "string" ? entry : entry.id;
    if (!id || !id.trim()) continue;
    out.push({
      id: id.trim(),
      format: typeof entry === "string" ? fmt : entry.format ?? fmt,
      rotate: typeof entry === "string" ? rot : entry.rotate ?? rot,
      definePrintout:
        typeof entry === "string" ? dp : entry.definePrintout ?? dp,
    });
  }
  return out;
}

/**
 * POST /v3/labels/printoptions/ids — returns available print options per shipment id.
 * Body is a plain JSON array of `{ id, format, rotate, definePrintout }`.
 */
export async function postPostNordLabelPrintOptions(
  items: PostNordLabelPrintOptionsRequestItem[],
): Promise<PostNordLabelPrintOptionsResult> {
  const apiKey = process.env.POSTNORD_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 503, message: "POSTNORD_API_KEY is not set" };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, status: 400, message: "Minst ett shipment-id krävs" };
  }

  const host = labelsHost();
  const url = new URL(`https://${host}/rest/shipment/v3/labels/printoptions/ids`);
  url.searchParams.set("apikey", apiKey);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  try {
    const bearer = await getPostNordBearerTokenNullable();
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
  } catch (e) {
    return {
      ok: false,
      status: 503,
      message: e instanceof Error ? e.message : "PostNord OAuth misslyckades",
    };
  }

  let res: Response;
  try {
    res = await postnordFetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(items),
    });
  } catch (e) {
    return {
      ok: false,
      status: 503,
      message: describePostNordNetworkError("Print Label Options API", e),
    };
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: "PostNord Print Label Options API rejected the request",
      details: text.slice(0, 4000),
    };
  }

  const body = (data && typeof data === "object" ? data : {}) as PostNordLabelPrintOptionsBody;
  return { ok: true, data: body, raw: data };
}
