/**
 * Renders every automated shipping notice to an HTML file so the copy and
 * layout can be looked at without sending anything to a real customer.
 *
 * These mails go out with no human in the loop, so "it compiled" is not
 * evidence they are fit to send.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@*\/node_modules/tsx/dist/cli.mjs \
 *     apps/product-service/src/__verify-shipping-notices.ts <outDir>
 */

import fs from "node:fs";
import path from "node:path";
import {
  renderShippingNoticeEmail,
  type ShippingNoticeKind,
  type ShippingNoticeData,
} from "./email-shipping-notices.js";

const outDir = process.argv[2] ?? ".";
fs.mkdirSync(outDir, { recursive: true });

const base: ShippingNoticeData = {
  firstName: "Johan",
  email: "kund@example.test",
  orderNumber: "ORD-261",
  trackingId: "00573132902028050319",
  servicePointName: "ICA Supermarket Backaplan",
  servicePointStreet: "Backavägen 1",
  servicePointPostalCode: "41717",
  servicePointCity: "Göteborg",
  locale: "sv",
};

const kinds: ShippingNoticeKind[] = [
  "ready_for_pickup",
  "pickup_reminder_1",
  "pickup_reminder_2",
  "order_delivered",
  "core_return_reminder",
];

for (const kind of kinds) {
  // Only the delivered mail carries the core-return block, and only when one is open.
  const data: ShippingNoticeData =
    kind === "order_delivered" || kind === "core_return_reminder"
      ? { ...base, coreReturnDeadline: new Date("2026-11-07") }
      : base;
  const html = renderShippingNoticeEmail(kind, data);
  const file = path.join(outDir, `${kind}.html`);
  fs.writeFileSync(file, html, "utf8");
  console.log(`wrote ${file} (${html.length} bytes)`);
}

// One English render, to prove the locale switch reaches every string.
const en = renderShippingNoticeEmail("ready_for_pickup", { ...base, locale: "en" });
fs.writeFileSync(path.join(outDir, "ready_for_pickup.en.html"), en, "utf8");
console.log(`wrote ready_for_pickup.en.html (${en.length} bytes)`);

// A parcel booked without a stored service point must still render.
const bare = renderShippingNoticeEmail("ready_for_pickup", {
  firstName: "Anna",
  email: "anna@example.test",
  orderNumber: "ORD-262",
  trackingId: "00573132902028050320",
  locale: "sv",
});
fs.writeFileSync(path.join(outDir, "ready_for_pickup.no-servicepoint.html"), bare, "utf8");
console.log(`wrote ready_for_pickup.no-servicepoint.html (${bare.length} bytes)`);
