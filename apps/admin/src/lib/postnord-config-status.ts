/**
 * Is PostNord booking actually configured?
 *
 * Pure environment inspection — no network, no DB — so it can never be the
 * thing that hangs, and can be called on every page load.
 *
 * Why this exists: "Boka frakt" failed for months with the single message
 * "PostNord Booking API rejected the request". The real reason was that the
 * agreement-specific variables (`POSTNORD_EDI_CUSTOMER_NUMBER`, the
 * `POSTNORD_CONSIGNOR_*` block) were never set, so the EDI payload went out
 * with the literal sender name "Sender", no address and no party
 * identification. That is knowable before any request is made, and this tells
 * the operator which variables to fill in instead of making them read a
 * PostNord error code.
 *
 * Every read here MUST mirror `postnord-booking-edi.ts` exactly, including its
 * fallbacks. A fallback that looks like a configured value — `"Sender"`,
 * service code `"52"` — is reported as missing, because a booking filed under
 * those defaults is not a real booking.
 */

import {
  getPostNordOAuthDiagnostics,
  postnordOAuthTokenUrl,
  postnordOAuthUsesDeadHost,
} from "./postnord-oauth";

export type ConfigSeverity = "blocking" | "warning" | "optional";

export type ConfigCheck = {
  /** Environment variable name — safe to show; never the value of a secret. */
  key: string;
  /** Swedish label for the admin UI. */
  label: string;
  present: boolean;
  severity: ConfigSeverity;
  /** Only populated for non-secret values worth verifying at a glance. */
  shownValue?: string;
  /** Swedish: what to do about it. */
  hint: string;
};

export type PostNordBookingConfigStatus = {
  /** No blocking checks are missing. */
  ready: boolean;
  mode: "test" | "production";
  host: string;
  /** Whether bookings will be flagged as test shipments at PostNord. */
  testIndicator: boolean;
  destinationCountries: string[];
  oauth: {
    willAttempt: boolean;
    tokenUrl: string;
    usesDeadHost: boolean;
    skipped: boolean;
    required: boolean;
    lastError: string | null;
  };
  blocking: ConfigCheck[];
  warnings: ConfigCheck[];
  all: ConfigCheck[];
};

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function isOn(name: string): boolean {
  const v = env(name).toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** Mirrors `ediHost()` in postnord-booking-edi.ts. */
function ediHost(): string {
  return process.env.POSTNORD_USE_TEST_API === "true"
    ? "atapi2.postnord.com"
    : (process.env.POSTNORD_API_HOST ?? "api2.postnord.com").replace(/^https?:\/\//, "");
}

/** Mirrors `getEdiDestinationCountries()` in postnord-booking-edi.ts. */
function destinationCountries(): string[] {
  const raw = env("POSTNORD_EDI_DESTINATION_COUNTRIES");
  return raw
    ? raw.split(/[\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean)
    : ["SE", "NO", "DK"];
}

export function getPostNordBookingConfigStatus(): PostNordBookingConfigStatus {
  const checks: ConfigCheck[] = [];
  const add = (c: ConfigCheck) => checks.push(c);

  const testMode = process.env.POSTNORD_USE_TEST_API === "true";
  const host = ediHost();
  const countries = destinationCountries();

  // ——— Blocking: without these a booking cannot succeed ———

  add({
    key: "POSTNORD_API_KEY",
    label: "API-nyckel",
    // Secret: presence only, never the value.
    present: env("POSTNORD_API_KEY") !== "",
    severity: "blocking",
    hint: "Utan nyckel avbryts bokningen direkt med 503. Hämtas i PostNords utvecklarportal.",
  });

  const customerNo = env("POSTNORD_EDI_CUSTOMER_NUMBER");
  add({
    key: "POSTNORD_EDI_CUSTOMER_NUMBER",
    label: "Avsändarnummer (EDI)",
    present: customerNo !== "",
    severity: "blocking",
    shownValue: customerNo || undefined,
    hint: "Ditt kundnummer hos PostNord. Saknas det utelämnas partyIdentification helt och PostNord avvisar bokningen.",
  });

  const company = env("POSTNORD_CONSIGNOR_COMPANY_NAME");
  add({
    key: "POSTNORD_CONSIGNOR_COMPANY_NAME",
    label: "Avsändarens företagsnamn",
    // The builder falls back to the literal "Sender"; treat that as missing —
    // a shipment filed as "Sender" is not a real shipment.
    present: company !== "" && company.toLowerCase() !== "sender",
    severity: "blocking",
    shownValue: company || undefined,
    hint: 'Utan detta skickas bokningen med avsändarnamnet "Sender".',
  });

  const street = env("POSTNORD_CONSIGNOR_STREET");
  const postal = env("POSTNORD_CONSIGNOR_POSTAL_CODE");
  const city = env("POSTNORD_CONSIGNOR_CITY");
  // The builder emits an address block only when all three are set, so they
  // are reported as one unit — two out of three is the same as none.
  for (const [key, label, value] of [
    ["POSTNORD_CONSIGNOR_STREET", "Avsändarens gatuadress", street],
    ["POSTNORD_CONSIGNOR_POSTAL_CODE", "Avsändarens postnummer", postal],
    ["POSTNORD_CONSIGNOR_CITY", "Avsändarens ort", city],
  ] as const) {
    add({
      key,
      label,
      present: value !== "",
      severity: "blocking",
      shownValue: value || undefined,
      hint: "Gata, postnummer och ort måste alla vara satta — annars skickas ingen avsändaradress alls.",
    });
  }

  const basicService = env("POSTNORD_EDI_BASIC_SERVICE_CODE");
  add({
    key: "POSTNORD_EDI_BASIC_SERVICE_CODE",
    label: "Tjänstekod",
    // "52" is the swagger example, not something from an agreement.
    present: basicService !== "",
    severity: "blocking",
    shownValue: basicService || "52 (standardvärde — inte från avtal)",
    hint: "Tjänstekoden för din avtalade produkt, t.ex. Postpaket hos ombud. Standardvärdet 52 är ett exempel ur dokumentationen.",
  });

  // ——— Warnings: the call proceeds, but something is quietly wrong ———

  const clientId = env("POSTNORD_CLIENT_ID");
  const skipOAuth = isOn("POSTNORD_SKIP_OAUTH");
  const willAttemptOAuth = !skipOAuth && clientId !== "";
  const deadHost = postnordOAuthUsesDeadHost();

  if (willAttemptOAuth && deadHost) {
    add({
      key: "POSTNORD_SKIP_OAUTH",
      label: "OAuth mot avvecklad värd",
      present: false,
      severity: "warning",
      shownValue: postnordOAuthTokenUrl(),
      hint: "POSTNORD_CLIENT_ID är satt men POSTNORD_OAUTH_TOKEN_URL saknas, så varje bokning försöker mot gate.ess.postnord.com som är borttagen (NXDOMAIN) och skickas sedan utan Bearer. Booking-API:t använder apikey — sätt POSTNORD_SKIP_OAUTH=true.",
    });
  }

  if (!testMode) {
    add({
      key: "POSTNORD_USE_TEST_API",
      label: "Testläge",
      present: false,
      severity: "warning",
      shownValue: host,
      hint: "Du pekar mot produktion. Sätt POSTNORD_USE_TEST_API=true för att boka mot atapi2.postnord.com tills allt är verifierat.",
    });
  }

  const publicCountries = env("NEXT_PUBLIC_POSTNORD_EDI_DESTINATION_COUNTRIES");
  const serverCountries = env("POSTNORD_EDI_DESTINATION_COUNTRIES");
  if (publicCountries && serverCountries && publicCountries !== serverCountries) {
    add({
      key: "NEXT_PUBLIC_POSTNORD_EDI_DESTINATION_COUNTRIES",
      label: "Landlistorna skiljer sig",
      present: false,
      severity: "warning",
      shownValue: `klient: ${publicCountries} / server: ${serverCountries}`,
      hint: "Knappen visas utifrån klientlistan men servern validerar mot sin egen. Håll dem lika, eller ta bort klientvarianten.",
    });
  }

  // ——— Optional ———

  for (const [key, label, hint] of [
    ["POSTNORD_CONSIGNOR_PHONE", "Avsändarens telefon", "Skickas som kontaktuppgift när den är satt."],
    ["POSTNORD_CONSIGNOR_EMAIL", "Avsändarens e-post", "Skickas som kontaktuppgift när den är satt."],
    ["POSTNORD_EDI_ADDITIONAL_SERVICE_CODES", "Tilläggstjänster", "T.ex. aviseringar. Lämna tom om avtalet inte kräver det."],
  ] as const) {
    add({ key, label, present: env(key) !== "", severity: "optional", hint });
  }

  const blocking = checks.filter((c) => c.severity === "blocking" && !c.present);
  const warnings = checks.filter((c) => c.severity === "warning" && !c.present);

  return {
    ready: blocking.length === 0,
    mode: testMode ? "test" : "production",
    host,
    testIndicator: process.env.POSTNORD_EDI_TEST === "true" || testMode,
    destinationCountries: countries,
    oauth: {
      willAttempt: willAttemptOAuth,
      tokenUrl: postnordOAuthTokenUrl(),
      usesDeadHost: deadHost,
      skipped: skipOAuth,
      required: isOn("POSTNORD_OAUTH_REQUIRED"),
      lastError: getPostNordOAuthDiagnostics().lastError,
    },
    blocking,
    warnings,
    all: checks,
  };
}
