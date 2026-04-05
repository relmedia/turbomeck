/**
 * PostNord Booking API — minimal EDI Instruction for domestic parcel to service point.
 * @see https://api2.postnord.com/rest/shipment/v3/edi?apikey=…
 * @see https://portal.postnord.com/se/sv/resurser/integrationer/api/boknings-api/
 *
 * Service codes (basicServiceCode / additionalServiceCode) depend on your agreement.
 * Confirm with PostNord kundintegration (Sweden: kundintegration.se@postnord.com).
 */

import {
  extractPostNordPrintId,
  extractPostNordTrackableShipmentId,
} from "./postnord-shipment-response-id";

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

/** Markets where “Boka frakt (EDI)” is allowed (storefront ombud countries by default). */
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
 * Build EDI Instruction JSON (shipmentInformation body for POST /v3/edi).
 */
export function buildEdiInstructionToServicePoint(input: PostnordBookToServicePointInput): Record<string, unknown> {
  const customerNo = process.env.POSTNORD_EDI_CUSTOMER_NUMBER?.trim();
  if (!customerNo) {
    throw new Error(
      "Sätt POSTNORD_EDI_CUSTOMER_NUMBER: PostNord kräver ert avsändarnummer (party id) i själva EDI-bokningen för avsändare/fraktbetalare. API-nyckeln (apikey) styr bara åtkomst till API:t och ersätter inte detta nummer — det kommer från ert PostNord-avtal / kundintegration."
    );
  }

  const issuerCode = process.env.POSTNORD_EDI_ISSUER_CODE?.trim() || "Z11";
  const partyIdType = process.env.POSTNORD_EDI_PARTY_ID_TYPE?.trim() || "160";
  const basicService = process.env.POSTNORD_EDI_BASIC_SERVICE_CODE?.trim() || "52";
  const additional = parseAdditionalCodes();
  const deliveryPartyIdType =
    process.env.POSTNORD_EDI_SERVICEPOINT_PARTY_ID_TYPE?.trim() || "17";

  const company = process.env.POSTNORD_CONSIGNOR_COMPANY_NAME?.trim() || "Sender";
  const cStreet = process.env.POSTNORD_CONSIGNOR_STREET?.trim() || "";
  const cPostal = process.env.POSTNORD_CONSIGNOR_POSTAL_CODE?.trim() || "";
  const cCity = process.env.POSTNORD_CONSIGNOR_CITY?.trim() || "";
  const cCountry = (process.env.POSTNORD_CONSIGNOR_COUNTRY?.trim() || "SE").toUpperCase();
  const cPhone = process.env.POSTNORD_CONSIGNOR_PHONE?.trim();
  const cEmail = process.env.POSTNORD_CONSIGNOR_EMAIL?.trim();

  if (!cStreet || !cPostal || !cCity) {
    throw new Error(
      "Set POSTNORD_CONSIGNOR_STREET, POSTNORD_CONSIGNOR_POSTAL_CODE, POSTNORD_CONSIGNOR_CITY for avsändare (EDI)"
    );
  }

  const testIndicator = process.env.POSTNORD_EDI_TEST === "true" || process.env.POSTNORD_USE_TEST_API === "true";

  const w = Math.max(0.1, Math.min(35, Math.round(input.weightKg * 10) / 10));
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const messageId = `tmeck-${input.orderReference}-${Date.now()}`;

  const consigneeName = `${input.consigneeFirstName} ${input.consigneeLastName}`.trim();
  const cc = (input.consigneeCountry || "SE").toUpperCase();

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
          consignor: {
            issuerCode,
            partyIdentification: {
              partyId: customerNo,
              partyIdType: partyIdType,
            },
            party: {
              nameIdentification: {
                companyName: company,
                name: company,
              },
              address: {
                streets: [cStreet],
                postalCode: cPostal.replace(/\s/g, ""),
                city: cCity,
                countryCode: cCountry,
              },
              contact: {
                contactName: company,
                emailAddress: cEmail ?? undefined,
                phoneNo: cPhone ?? undefined,
              },
              legalEntity: { businessType: "B" },
            },
          },
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
          freightPayer: {
            issuerCode,
            partyIdentification: {
              partyId: customerNo,
              partyIdType: partyIdType,
            },
            party: {
              nameIdentification: {
                companyName: company,
                name: company,
              },
              address: {
                streets: [cStreet],
                postalCode: cPostal.replace(/\s/g, ""),
                city: cCity,
                countryCode: cCountry,
              },
              contact: {
                contactName: company,
                emailAddress: cEmail ?? undefined,
                phoneNo: cPhone ?? undefined,
              },
              legalEntity: { businessType: "B" },
            },
          },
          deliveryParty: {
            partyIdentification: {
              partyId: input.servicePointId.trim(),
              partyIdType: deliveryPartyIdType,
            },
            party: {
              nameIdentification: {
                name: (input.servicePointName ?? "PostNord ombud").slice(0, 70),
              },
            },
          },
        },
        goodsItem: [
          {
            goodsDescription: `Order ${input.orderReference}`,
            numberOfPackageTypeCodeItems: { value: 1 },
            items: [
              {
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
      trackableId: string;
      printId: string | null;
      rawBookingJson: unknown;
    }
  | { ok: false; status: number; message: string; details?: string };

/**
 * Merge the outbound EDI instruction with `idInformation` from the booking response
 * so PostNord can render the label PDF (see POST /rest/shipment/v3/edi/labels/pdf).
 */
export function buildEdiInstructionForLabelPdf(
  shipmentInformation: Record<string, unknown>,
  bookingResponse: unknown
): Record<string, unknown> | null {
  if (bookingResponse == null || typeof bookingResponse !== "object") return null;
  const idInformation = (bookingResponse as Record<string, unknown>).idInformation;
  if (!Array.isArray(idInformation) || idInformation.length === 0) return null;
  return {
    ...shipmentInformation,
    idInformation,
  };
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

export async function postEdiLabelPdf(ediBody: Record<string, unknown>): Promise<PostnordEdiLabelPdfResult> {
  const apiKey = process.env.POSTNORD_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 503, message: "POSTNORD_API_KEY is not set" };
  }

  const host = ediHost();
  const url = new URL(`https://${host}/rest/shipment/v3/edi/labels/pdf`);
  url.searchParams.set("apikey", apiKey);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/pdf,*/*" },
    body: JSON.stringify(ediBody),
  });

  const body = await res.arrayBuffer();
  const ct = (res.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() || "";

  if (res.ok && body.byteLength > 0 && (ct.includes("pdf") || isLikelyPdf(body))) {
    return { ok: true, body, contentType: "application/pdf" };
  }

  const details =
    body.byteLength > 0 && body.byteLength < 12000
      ? new TextDecoder().decode(body)
      : undefined;
  return {
    ok: false,
    status: res.status,
    message: "PostNord label API did not return a PDF",
    details: details?.slice(0, 4000),
  };
}

export async function postEdiBooking(shipmentInformation: Record<string, unknown>): Promise<PostnordEdiBookResult> {
  const apiKey = process.env.POSTNORD_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 503, message: "POSTNORD_API_KEY is not set" };
  }

  const host = ediHost();
  const url = new URL(`https://${host}/rest/shipment/v3/edi`);
  url.searchParams.set("apikey", apiKey);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(shipmentInformation),
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (res.status !== 201) {
    return {
      ok: false,
      status: res.status,
      message: "PostNord Booking API rejected the request",
      details: text.slice(0, 4000),
    };
  }

  const trackableId = extractPostNordTrackableShipmentId(data);
  if (!trackableId) {
    return {
      ok: false,
      status: 502,
      message: "Booking succeeded but no trackable id was found in the response",
      details: text.slice(0, 2000),
    };
  }

  const printId = extractPostNordPrintId(data);
  return { ok: true, data, trackableId, printId, rawBookingJson: data };
}
