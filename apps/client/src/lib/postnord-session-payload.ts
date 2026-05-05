/**
 * Builds the JSON body for PostNord Shipping Module create-session / update-session.
 * @see https://devportal.postnord.com/pn-shipping-module/v1/index.html
 *
 * Differences vs old code:
 * - `shippingParameters` is always an object (PostNord matches by attributes even if dimensions are null).
 * - Items pass through `notes` / `taxCode` / `taxAmount` when our checkout has them.
 * - `extraIdentifiers.orderReference` ties a PostNord session to our internal order/checkout id.
 * - `deliveryAddress.type` falls back to "Private", but switches to "Company" when companyName is present.
 */

const SITE_CODE = process.env.POSTNORD_SITE_CODE ?? "acmeSE";
const SWEDEN_VAT_RATE_DEFAULT = process.env.POSTNORD_DEFAULT_TAX_CODE ?? "25";

type ItemIn = {
  name?: string;
  description?: string;
  notes?: string | null;
  price?: number | string;
  amount?: number | string;
  quantity?: number | string;
  weight?: number | string | null;
  width?: number | null;
  height?: number | null;
  length?: number | null;
  attributes?: string[];
  taxCode?: string | number | null;
  taxAmount?: number | string | null;
};

type AddressIn = {
  address?: string | null;
  address1?: string | null;
  address2?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
  zip?: string | null;
  city?: string | null;
  type?: string | null;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null;
  coordinates?: { lat?: number; lng?: number } | null;
};

type UserInputsIn = {
  email?: string | null;
  phone?: string | null;
  phoneCountryTwoLetterIso?: string | null;
};

export type PostNordSessionInput = {
  purchaseId?: string;
  language?: string;
  locale?: string;
  /** Optional override for currency (default SEK). */
  currencyCode?: string;
  /** Internal order/checkout reference. Sent as extraIdentifiers.orderReference. */
  orderReference?: string;
  items?: ItemIn[];
  deliveryAddress?: AddressIn;
  userInputs?: UserInputsIn;
  shippingSettings?: { vouchers?: unknown; attributes?: unknown };
};

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function nullableNumber(value: unknown): number | null {
  const n = num(value, NaN);
  return Number.isFinite(n) ? n : null;
}

export function buildPostNordSessionBody(
  input: PostNordSessionInput,
  mode: "create" | "update",
): Record<string, unknown> {
  const address = input.deliveryAddress ?? {};
  const userInputs = input.userInputs ?? {};
  const country = (address.country ?? "SE").toUpperCase();
  const langSrc = input.language ?? input.locale ?? "sv-SE";
  const language = langSrc.startsWith("sv") ? "sv-SE" : "en-US";
  const currencyCode = input.currencyCode ?? "SEK";

  const items = (input.items ?? []).map((item) => {
    const description = (item.description ?? item.name ?? "Produkt").toString();
    const amount = num(item.amount ?? item.price);
    const quantity = num(item.quantity, 1);
    const taxCode = item.taxCode != null ? String(item.taxCode) : SWEDEN_VAT_RATE_DEFAULT;
    const taxAmount = item.taxAmount != null ? num(item.taxAmount) : undefined;

    const shippingParameters = {
      width: nullableNumber(item.width),
      height: nullableNumber(item.height),
      length: nullableNumber(item.length),
      weight: nullableNumber(item.weight),
      attributes: Array.isArray(item.attributes) ? item.attributes : [],
    };

    const out: Record<string, unknown> = {
      description,
      amount,
      quantity,
      shippingParameters,
      taxCode,
    };
    if (item.notes) out.notes = item.notes;
    if (taxAmount != null) out.taxAmount = taxAmount;
    return out;
  });

  const addressType = address.type ?? (address.companyName ? "Company" : "Private");

  const deliveryAddress: Record<string, unknown> = {
    address1: address.address1 ?? address.address ?? null,
    address2: address.address2 ?? null,
    street: address.street ?? address.address ?? null,
    houseNumber: address.houseNumber ?? null,
    zip: address.zip ?? address.postalCode ?? null,
    city: address.city ?? null,
    type: addressType,
    firstName: address.firstName ?? null,
    lastName: address.lastName ?? null,
    country,
  };
  if (address.companyName) deliveryAddress.companyName = address.companyName;
  if (address.coordinates && (address.coordinates.lat || address.coordinates.lng)) {
    deliveryAddress.coordinates = address.coordinates;
  }

  const phoneIso = (userInputs.phoneCountryTwoLetterIso ?? country).toUpperCase();

  const base: Record<string, unknown> = {
    purchaseId: input.purchaseId ?? `P${Date.now()}`,
    [mode === "create" ? "language" : "locale"]: language,
    mode: mode === "create" ? 1 : 0,
    checkoutSite: {
      siteCode: SITE_CODE,
      countryCode: country,
      currencyCode,
    },
    items,
    deliveryAddress,
    userInputs: {
      email: userInputs.email ?? null,
      phoneCountryTwoLetterIso: phoneIso,
      phone: userInputs.phone ?? null,
    },
  };

  if (mode === "update") {
    base.shippingSettings = input.shippingSettings ?? { vouchers: null, attributes: null };
  }
  if (input.orderReference) {
    base.extraIdentifiers = { orderReference: input.orderReference };
  }

  return base;
}
