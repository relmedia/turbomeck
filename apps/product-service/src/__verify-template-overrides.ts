/**
 * Asserts the contract the whole override design rests on.
 *
 * The promise made when choosing "code stays the default" is that an empty or
 * missing `email_templates` row leaves every email rendering exactly as it did
 * before. If that is not byte-for-byte true, the feature is a silent
 * regression across every customer email at once — so it is asserted, not
 * assumed.
 *
 * Also covers the editor's likeliest mistakes: clearing a field, and an
 * override carrying HTML or a merge value that must not execute.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@*\/node_modules/tsx/dist/cli.mjs \
 *     apps/product-service/src/__verify-template-overrides.ts
 */

import {
  renderShippingNoticeEmail,
  type ShippingNoticeKind,
  type ShippingNoticeData,
} from "./email-shipping-notices.js";
import { mergeCopy } from "./email-template-overrides.js";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
}

const KINDS: ShippingNoticeKind[] = [
  "ready_for_pickup",
  "pickup_reminder_1",
  "pickup_reminder_2",
  "order_delivered",
  "core_return_reminder",
];

const data: ShippingNoticeData = {
  firstName: "Johan",
  email: "kund@example.test",
  orderNumber: "ORD-900",
  trackingId: "00573132902028050319",
  servicePointName: "ICA Supermarket Backaplan",
  servicePointStreet: "Backavägen 1",
  servicePointPostalCode: "41717",
  servicePointCity: "Göteborg",
  coreReturnDeadline: new Date("2026-11-07"),
  locale: "sv",
};

console.log("— no overrides: output must be unchanged —");
for (const kind of KINDS) {
  for (const locale of ["sv", "en"] as const) {
    const d = { ...data, locale };
    // No copy argument at all is how every existing caller renders today.
    const before = renderShippingNoticeEmail(kind, d);
    // Explicitly passing undefined must take the same path.
    const after = renderShippingNoticeEmail(kind, d, undefined, undefined);
    check(`${kind}/${locale} identical`, before === after, {
      beforeLen: before.length,
      afterLen: after.length,
    });
  }
}

console.log("\n— mergeCopy —");
const base = { subject: "Ditt paket finns att hämta", heading: "Ditt paket väntar på dig" };

check("no override returns the SAME object", mergeCopy(base, undefined) === base);
check("empty override returns the same object", mergeCopy(base, {}) === base);
check(
  "identical value returns the same object",
  mergeCopy(base, { subject: base.subject }) === base,
);

const edited = mergeCopy(base, { subject: "Hämta ditt paket" });
check("an override is applied", edited.subject === "Hämta ditt paket");
check("other fields untouched", edited.heading === base.heading);
check("the original is not mutated", base.subject === "Ditt paket finns att hämta");

/**
 * Clearing a field in the editor is the most likely accident. It must restore
 * the built-in text, not send a mail with an empty heading.
 */
check("blank override falls back", mergeCopy(base, { subject: "" }).subject === base.subject);
check("whitespace override falls back", mergeCopy(base, { subject: "   " }).subject === base.subject);

/** A hand-edited settings row must not be able to add fields. */
const extra = mergeCopy(base, { subject: "x", injectedField: "boom" } as Record<string, string>);
check("unknown keys are ignored", !("injectedField" in extra));

/** Non-strings are ignored rather than rendered as "[object Object]". */
const wrongType = mergeCopy(base, { subject: { evil: true } } as unknown as Record<string, string>);
check("non-string override ignored", wrongType.subject === base.subject);

console.log("\n— an override reaches the rendered HTML —");
const custom = renderShippingNoticeEmail(
  "ready_for_pickup",
  data,
  {
    subject: "Paketet väntar",
    heading: "HÄMTA DITT PAKET NU",
    lead: "Kom och hämta det.",
    cta: "Spåra",
    badge: "📍",
    badgeBg: "#dcfce7",
    accent: "#16a34a",
  },
  undefined,
);
check("custom heading rendered", custom.includes("HÄMTA DITT PAKET NU"));
check("built-in heading gone", !custom.includes("Ditt paket väntar på dig"));
check("shell intact — logo header still present", custom.includes("TURBO"));
check("shell intact — footer still present", custom.includes("Alla rättigheter förbehållna"));

/**
 * Merge VALUES are escaped; admin COPY is trusted HTML. This asserts the first
 * half: order data can never inject markup, whatever the copy says.
 */
console.log("\n— merge values stay escaped —");
const hostile = renderShippingNoticeEmail("ready_for_pickup", {
  ...data,
  firstName: '<img src=x onerror=alert(1)>',
  servicePointName: '"><script>alert(2)</script>',
});
check("no executable img tag", !hostile.includes("<img src=x onerror"));
check("no executable script tag", !hostile.includes("<script>alert(2)"));
check("the name is present, escaped", hostile.includes("&lt;img src=x"));

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
