/**
 * PostNord Booking API — shipment instruction for parcel to service point (ombud).
 * @see https://api2.postnord.com/rest/shipment/v3/edi?apikey=…
 * @see https://portal.postnord.com/se/sv/resurser/integrationer/api/boknings-api/
 *
 * IAM-style: avsändarnummer (`POSTNORD_EDI_CUSTOMER_NUMBER`) and full consignor address are optional
 * when PostNord ties the sender to your contract; include them if your agreement requires it.
 */

import {
  extractPostNordPrintId,
  extractPostNordTrackableShipmentId,
} from "./postnord-shipment-response-id";
import { getPostNordBearerTokenNullable } from "./postnord-oauth";
import { describePostNordNetworkError } from "./postnord-fetch-errors";
import { postnordFetch } from "./postnord-node-dns";

let cachedEdiDestinationCountries: Set<string> | null = null;

function getEdiDestinationCountries(): Set<string> {
  if (!cachedEdiDestinationCountries) {
    const raw = process.env.POSTNORD_EDI_DESTINATION_COUNTRIES?.trim();
    const parts = raw
      ? raw.split(/[\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean)
      : ["SE", "NO", "DK"];
    cachedEdiDestinationCountries = new Set(parts);
  }
  return cachedEdiDestinationCountries;
}

/** Markets where PostNord service-point booking is allowed (default SE, NO, DK). */
export function isPostNordEdiDestinationCountry(country: string | null | undefined): boolean {
  return getEdiDestinationCountries().has((country ?? "").toUpperCase());
}

export type PostnordBookToServicePointInput = {
  orderReference: string;
  consigneeFirstName: string;
  consigneeLastName: string;
  consigneeStreet: string;
  consigneePostalCode: string;
  consigneeCity: string;
  consigneeCountry: string;
  consigneePhone?: string | null;
  consigneeEmail?: string | null;
  servicePointId: string;
  servicePointName?: string | null;
  /**
   * The service point's own address. PostNord rejects the booking without it
   * ("address is a required field", subType ADDRESS) and it cannot be looked
   * up at booking time — every by-id service point endpoint returns 410 Gone.
   * Stored on the order when the point is chosen.
   */
  servicePointStreet?: string | null;
  servicePointPostalCode?: string | null;
  servicePointCity?: string | null;
  servicePointCountryCode?: string | null;
  weightKg: number;
};

function ediHost(): string {
  return process.env.POSTNORD_USE_TEST_API === "true"
    ? "atapi2.postnord.com"
    : (process.env.POSTNORD_API_HOST ?? "api2.postnord.com").replace(/^https?:\/\//, "");
}

function parseAdditionalCodes(): string[] {
  const raw = process.env.POSTNORD_EDI_ADDITIONAL_SERVICE_CODES?.trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const a = JSON.parse(raw) as unknown;
      return Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Build booking instruction JSON (body for POST /rest/shipment/v3/edi).
 */
export function buildEdiInstructionToServicePoint(input: PostnordBookToServicePointInput): Record<string, unknown> {
  const customerNo = process.env.POSTNORD_EDI_CUSTOMER_NUMBER?.trim() ?? "";

  const issuerCode = process.env.POSTNORD_EDI_ISSUER_CODE?.trim() || "Z11";
  const partyIdType = process.env.POSTNORD_EDI_PARTY_ID_TYPE?.trim() || "160";
  const basicService = process.env.POSTNORD_EDI_BASIC_SERVICE_CODE?.trim() || "52";
  const additional = parseAdditionalCodes();
  /**
   * Service points are identified with partyIdType "156", not "17".
   *
   * PostNord rejects "17" outright:
   *   SAE-BR-25020309 "Invalid partyIdType", party=deliveryParty,
   *   partyIdType=17, DELIVERY_PARTY_FAULTY
   *
   * "160" stays correct for consignor and freightPayer — only the delivery
   * party differs. Confirmed against the working connector at
   * github.com/PrimePack-AB/karrio-postnord, whose `_delivery_party` is
   * documented as partyIdType "156".
   */
  const deliveryPartyIdType =
    process.env.POSTNORD_EDI_SERVICEPOINT_PARTY_ID_TYPE?.trim() || "156";

  const company = process.env.POSTNORD_CONSIGNOR_COMPANY_NAME?.trim() || "Sender";
  const cStreet = process.env.POSTNORD_CONSIGNOR_STREET?.trim() || "";
  const cPostal = process.env.POSTNORD_CONSIGNOR_POSTAL_CODE?.trim() || "";
  const cCity = process.env.POSTNORD_CONSIGNOR_CITY?.trim() || "";
  const cCountry = (process.env.POSTNORD_CONSIGNOR_COUNTRY?.trim() || "SE").toUpperCase();
  const cPhone = process.env.POSTNORD_CONSIGNOR_PHONE?.trim();
  const cEmail = process.env.POSTNORD_CONSIGNOR_EMAIL?.trim();

  const hasFullConsignorAddress = !!(cStreet && cPostal && cCity);

  function buildFreightRelatedParty(): Record<string, unknown> {
    const party: Record<string, unknown> = {
      nameIdentification: {
        companyName: company,
        name: company,
      },
      legalEntity: { businessType: "B" },
    };
    if (hasFullConsignorAddress) {
      party.address = {
        streets: [cStreet],
        postalCode: cPostal.replace(/\s/g, ""),
        city: cCity,
        countryCode: cCountry,
      };
    }
    const contact: Record<string, string> = { contactName: company };
    if (cEmail) contact.emailAddress = cEmail;
    if (cPhone) contact.phoneNo = cPhone;
    party.contact = contact;

    const block: Record<string, unknown> = { issuerCode, party };
    if (customerNo) {
      block.partyIdentification = { partyId: customerNo, partyIdType };
    }
    return block;
  }

  const testIndicator = process.env.POSTNORD_EDI_TEST === "true" || process.env.POSTNORD_USE_TEST_API === "true";

  const w = Math.max(0.1, Math.min(35, Math.round(input.weightKg * 10) / 10));
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const messageId = `tmeck-${input.orderReference}-${Date.now()}`;

  const consigneeName = `${input.consigneeFirstName} ${input.consigneeLastName}`.trim();
  const cc = (input.consigneeCountry || "SE").toUpperCase();

  const spStreet = input.servicePointStreet?.trim() ?? "";
  const spPostal = input.servicePointPostalCode?.trim() ?? "";
  const spCity = input.servicePointCity?.trim() ?? "";
  const spCountry = (input.servicePointCountryCode?.trim() || cc).toUpperCase();

  const consignorBlock = buildFreightRelatedParty();
  const freightPayerBlock = buildFreightRelatedParty();

  return {
    messageDate: now,
    messageFunction: "Instruction",
    messageId,
    application: {
      applicationId: Number(process.env.POSTNORD_EDI_APPLICATION_ID || "9999") || 9999,
      name: process.env.POSTNORD_EDI_APPLICATION_NAME?.trim() || "Turbomeck Admin",
      version: process.env.POSTNORD_EDI_APPLICATION_VERSION?.trim() || "1.0",
    },
    language: (process.env.POSTNORD_EDI_LANGUAGE?.trim() || "SV").toUpperCase(),
    updateIndicator: "Original",
    testIndicator,
    shipment: [
      {
        service: {
          basicServiceCode: basicService,
          ...(additional.length > 0 ? { additionalServiceCode: additional } : {}),
        },
        numberOfPackages: { value: 1 },
        totalGrossWeight: { value: w, unit: "KGM" },
        references: [
          {
            referenceNo: input.orderReference.slice(0, 35),
            referenceType: "CU",
            referenceDesc: "Order",
          },
        ],
        parties: {
          consignor: consignorBlock,
          consignee: {
            party: {
              nameIdentification: {
                name: consigneeName,
              },
              address: {
                streets: [input.consigneeStreet],
                postalCode: input.consigneePostalCode.replace(/\s/g, ""),
                city: input.consigneeCity,
                countryCode: cc,
              },
              contact: {
                contactName: consigneeName,
                emailAddress: input.consigneeEmail ?? undefined,
                phoneNo: input.consigneePhone ?? undefined,
              },
              legalEntity: { businessType: "P" },
            },
          },
          freightPayer: freightPayerBlock,
          deliveryParty: {
            partyIdentification: {
              partyId: input.servicePointId.trim(),
              partyIdType: deliveryPartyIdType,
            },
            party: {
              nameIdentification: {
                name: (input.servicePointName ?? "PostNord ombud").slice(0, 70),
              },
              // Only sent when complete: a half address (street but no city)
              // is rejected the same way a missing one is, and sending nothing
              // at least produces PostNord's own clear error rather than a
              // confusing partial-address fault.
              ...(spStreet && spPostal && spCity
                ? {
                    address: {
                      streets: [spStreet],
                      postalCode: spPostal.replace(/\s/g, ""),
                      city: spCity,
                      countryCode: spCountry,
                    },
                  }
                : {}),
            },
          },
        },
        goodsItem: [
          {
            goodsDescription: `Order ${input.orderReference}`,
            numberOfPackageTypeCodeItems: { value: 1 },
            items: [
              {
                /**
                 * `"0"` asks PostNord to allocate the parcel id itself, and it
                 * comes back as the tracking number in `idInformation` — which
                 * is exactly what `extractPostNordTrackingId` already reads.
                 *
                 * The field is mandatory: omitting it fails validation with
                 * "itemIdentification is a required field". But it must not be
                 * an arbitrary string either — PostNord infers the id scheme
                 * (SSCC, S10, …) from the value, so anything that is not a real
                 * id in a series allocated to this customer number fails with
                 * "unable to determine id type". `"0"` is the documented way to
                 * say "you pick".
                 */
                itemIdentification: { itemId: "0" },
                grossWeight: { value: w, unit: "KGM" },
              },
            ],
          },
        ],
      },
    ],
  };
}

export type PostnordEdiBookResult =
  | {
      ok: true;
      data: unknown;
      /**
       * Null when PostNord accepted the booking but returned no parseable
       * shipment id. The parcel exists either way, so this is deliberately NOT
       * a failure — see `needsManualId`.
       */
      trackableId: string | null;
      /** True when the booking was accepted but no id could be extracted. */
      needsManualId: boolean;
      printId: string | null;
      rawBookingJson: unknown;
      /**
       * The label, base64 PDF, from the very same call that booked the parcel.
       *
       * Captured here because asking for it again is destructive — the label
       * endpoint books another parcel each time. Null if PostNord returned no
       * printout, which is not a failure: the parcel still exists.
       */
      labelPdfBase64: string | null;
      labelPaperSize: string | null;
    }
  | { ok: false; status: number; message: string; details?: string };

/**
 * A record of the booking: what was sent, plus the ids that came back.
 *
 * It used to be a *payload* — re-posted to `/v3/edi/labels/pdf` to re-render
 * the label — which is precisely how printing came to book extra parcels. That
 * use is gone; the label is stored on the order instead. What remains is
 * history, and the source of the booked weight, date and test flag the admin
 * shows, so it is still written even when no ids come back.
 */
export function buildEdiInstructionForLabelPdf(
  shipmentInformation: Record<string, unknown>,
  bookingResponse: unknown
): Record<string, unknown> | null {
  if (bookingResponse == null || typeof bookingResponse !== "object") {
    // Still worth keeping what we sent.
    return { ...shipmentInformation };
  }
  const root = bookingResponse as Record<string, unknown>;
  // Booking via the label endpoint nests the response under `bookingResponse`.
  const nested = root.bookingResponse;
  const idSource =
    nested != null && typeof nested === "object" && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : root;
  const idInformation = idSource.idInformation;
  return Array.isArray(idInformation) && idInformation.length > 0
    ? { ...shipmentInformation, idInformation }
    : { ...shipmentInformation };
}

export type PostnordEdiLabelPdfResult =
  | { ok: true; body: ArrayBuffer; contentType: string }
  | { ok: false; status: number; message: string; details?: string };

/**
 * Fetch shipping label PDF (or ZPL) from PostNord after a successful EDI booking.
 * `ediBody` must be the merged instruction from {@link buildEdiInstructionForLabelPdf}.
 */
function isLikelyPdf(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false;
  const u8 = new Uint8Array(buf, 0, 4);
  return u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46; // %PDF
}

/**
 * Pull the label out of a JSON label response.
 *
 * PostNord answers `/v3/edi/labels/pdf` with `200 application/json`, not raw
 * PDF bytes: the document arrives base64-encoded at
 * `labelPrintout[].printout.data`. Treating that as a failure is what produced
 * "PostNord label API did not return a PDF" on a booking that had in fact
 * succeeded.
 *
 * `encoding` is documented only as `"base64"`, but ZPL printouts come back as
 * raw text with `encoding: "none"`, so anything that is not base64 is taken
 * verbatim.
 */
function pdfFromJsonLabelResponse(
  json: unknown,
): { body: ArrayBuffer; contentType: string } | null {
  if (!json || typeof json !== "object") return null;
  const printouts = (json as { labelPrintout?: unknown }).labelPrintout;
  if (!Array.isArray(printouts)) return null;

  for (const entry of printouts) {
    const printout = (entry as { printout?: unknown } | null)?.printout as
      | Record<string, unknown>
      | undefined;
    const data = printout?.data;
    if (typeof data !== "string" || data.length === 0) continue;

    const encoding = String(printout?.encoding ?? "base64").toLowerCase();
    const bytes =
      encoding === "base64"
        ? Buffer.from(data, "base64")
        : Buffer.from(data, "utf8");

    // Copy into a standalone ArrayBuffer: Buffer views share a pooled
    // allocation, so handing `.buffer` straight out can expose unrelated bytes.
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;

    const format = String(printout?.labelFormat ?? "").toUpperCase();
    if (format === "PDF" || isLikelyPdf(body)) {
      return { body, contentType: "application/pdf" };
    }
    // ZPL and friends: still the label, just not a PDF.
    return { body, contentType: "application/octet-stream" };
  }
  return null;
}

/**
 * Print options, as offered by `/v3/labels/printoptions/ids` for the parcel.
 *
 * Passed to PostNord as query parameters. Omitted keys simply fall back to
 * PostNord's defaults, which is what the plain "Fraktetikett PDF" button uses.
 */
export type PostNordLabelPrintSettings = {
  /** A4, A5, A6, LETTER, LABEL */
  paperSize?: string;
  /** e.g. "standard", "ps1", "ste" — valid values differ per parcel. */
  labelType?: string;
  rotate?: "0" | "90" | "180" | "270";
};

/**
 * NOTE: there is deliberately no "post an EDI instruction to get a label"
 * helper here any more.
 *
 * `/v3/edi/labels/pdf` is book-and-print: each POST registers a new parcel.
 * The only call to it is inside `postEdiBooking`, once, when the parcel is
 * created. Printing an existing label reads the PDF stored on the order, or
 * goes through `fetchStoredLabelById` (`/v3/labels/ids/pdf`), which books
 * nothing. Re-adding a general-purpose label poster here is how this turned
 * into ~30 unintended parcels the first time.
 */

/** Paper size a booking's label is rendered at when nothing else is chosen. */
export const DEFAULT_LABEL_PAPER_SIZE = "A5";

/**
 * Book the shipment AND take its label in one call.
 *
 * Deliberately posts to `/v3/edi/labels/pdf` rather than `/v3/edi`. That
 * endpoint is book-and-print: it registers the parcel and returns the label
 * together. Booking through it is the only way to obtain a label for the parcel
 * actually booked — calling it afterwards books a *different* parcel and prints
 * that one's label instead (two identical calls returned …512511 and …512528).
 *
 * `storeLabel=true` additionally asks PostNord to keep the label, which is what
 * makes a later reprint by id possible at all.
 */
export async function postEdiBooking(
  shipmentInformation: Record<string, unknown>,
  paperSize: string = DEFAULT_LABEL_PAPER_SIZE,
): Promise<PostnordEdiBookResult> {
  const apiKey = process.env.POSTNORD_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 503, message: "POSTNORD_API_KEY is not set" };
  }

  const host = ediHost();
  const url = new URL(`https://${host}/rest/shipment/v3/edi/labels/pdf`);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("paperSize", paperSize);
  url.searchParams.set("storeLabel", "true");

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  /**
   * Captured before the request so every failure branch can report it.
   * Whether a Bearer was attached is the single most useful fact when
   * diagnosing a rejection, because the OAuth token host was decommissioned
   * and the fallback is silent.
   */
  let bearerAttached = false;
  const messageId =
    (shipmentInformation as { messageId?: unknown }).messageId ?? "(okänt)";

  try {
    const bearer = await getPostNordBearerTokenNullable();
    if (bearer) {
      headers.Authorization = `Bearer ${bearer}`;
      bearerAttached = true;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "PostNord OAuth misslyckades";
    console.error("[postnord-edi] OAuth failed, booking aborted", { host, messageId, message });
    return { ok: false, status: 503, message };
  }

  let res: Response;
  try {
    res = await postnordFetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(shipmentInformation),
    });
  } catch (e) {
    const message = describePostNordNetworkError("Boknings-API", e);
    console.error("[postnord-edi] booking request failed before a response", {
      host,
      messageId,
      bearerAttached,
      message,
    });
    return { ok: false, status: 503, message };
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  /**
   * `res.ok`, not `=== 201`.
   *
   * Treating a 200 as a failure is the worst outcome available here: PostNord
   * has created a real parcel and we report an error, so the shipment is
   * orphaned — booked, billed, and invisible to the shop.
   */
  if (!res.ok) {
    console.error("[postnord-edi] booking rejected", {
      status: res.status,
      host,
      path: "/rest/shipment/v3/edi/labels/pdf",
      bearerAttached,
      messageId,
      body: text.slice(0, 2000),
    });
    return {
      ok: false,
      status: res.status,
      message: "PostNord Booking API rejected the request",
      details: text.slice(0, 4000),
    };
  }

  const trackableId = extractPostNordTrackableShipmentId(data);
  const printId = extractPostNordPrintId(data);

  if (!trackableId) {
    // Accepted, but we cannot read an id out of the response. The parcel is
    // real, so this stays a success and the caller surfaces a warning asking
    // the operator to paste the number from PostNord's portal.
    console.error("[postnord-edi] booking accepted but no trackable id found", {
      status: res.status,
      host,
      bearerAttached,
      messageId,
      body: text.slice(0, 4000),
    });
  }

  /**
   * Keep the label that came back with the booking. If PostNord returned none,
   * that is not a failure — the parcel exists — but the order then has no label
   * to reprint, and asking for one later would book another parcel.
   */
  const printout = pdfFromJsonLabelResponse(data);
  const labelPdfBase64 = printout
    ? Buffer.from(printout.body).toString("base64")
    : null;
  if (!labelPdfBase64) {
    console.warn("[postnord-edi] booking accepted but carried no label printout", {
      messageId,
      trackableId,
    });
  }

  return {
    ok: true,
    data,
    trackableId,
    needsManualId: !trackableId,
    printId,
    rawBookingJson: data,
    labelPdfBase64,
    labelPaperSize: labelPdfBase64 ? paperSize : null,
  };
}
