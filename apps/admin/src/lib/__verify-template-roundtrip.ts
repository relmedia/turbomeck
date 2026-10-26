/**
 * Writes an override straight to app_settings, renders through the real
 * resolver, then cleans up.
 *
 * EXCLUDED from the admin tsconfig on purpose: it reaches across into
 * product-service, which imports nodemailer, which ships no types — pulling
 * that into the Next.js type graph fails the admin build. It is run directly
 * with tsx, never bundled.
 *
 * The unit test covers mergeCopy in isolation; this covers the part that can
 * only break in integration — that what the save route stores is the shape the
 * resolver reads, through the DB, with the cache in play.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@*\/node_modules/tsx/dist/cli.mjs \
 *     --env-file=apps/admin/.env apps/admin/src/lib/__verify-template-roundtrip.ts
 */
import { db } from "@repo/database";
import { appSettings } from "@repo/database/schema";
import { eq } from "drizzle-orm";

const KEY = "email_templates";
let failures = 0;
const check = (l: string, ok: boolean, d?: unknown) => {
  console.log(`${ok ? "  OK  " : " FAIL "} ${l}${d !== undefined ? ` — ${JSON.stringify(d)}` : ""}`);
  if (!ok) failures++;
};

async function readRow() {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  return row?.value ? JSON.parse(row.value) : null;
}

async function main() {
  const before = await readRow();
  console.log(`existing ${KEY} row: ${before ? "present" : "none"}\n`);

  const payload = {
    overrides: {
      ready_for_pickup: { sv: { heading: "HÄMTA DITT PAKET" } },
    },
  };
  const value = JSON.stringify(payload);
  await db
    .insert(appSettings)
    .values({ key: KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });

  const { resolveCopy } = await import(
    "../../../product-service/src/email-template-overrides.js"
  );
  const { SHIPPING_NOTICE_COPY } = await import(
    "../../../product-service/src/email-shipping-notices.js"
  );

  const sv = await resolveCopy("ready_for_pickup", "sv", SHIPPING_NOTICE_COPY.ready_for_pickup.sv);
  check("override reaches the resolver", sv.heading === "HÄMTA DITT PAKET", sv.heading);
  check("untouched field keeps its default", sv.subject === SHIPPING_NOTICE_COPY.ready_for_pickup.sv.subject);

  const en = await resolveCopy("ready_for_pickup", "en", SHIPPING_NOTICE_COPY.ready_for_pickup.en);
  check("other locale unaffected", en.heading === SHIPPING_NOTICE_COPY.ready_for_pickup.en.heading);

  const other = await resolveCopy("order_delivered", "sv", SHIPPING_NOTICE_COPY.order_delivered.sv);
  check("other template unaffected", other.heading === SHIPPING_NOTICE_COPY.order_delivered.sv.heading);

  // Restore exactly what was there before.
  if (before) {
    const v = JSON.stringify(before);
    await db.update(appSettings).set({ value: v, updatedAt: new Date() }).where(eq(appSettings.key, KEY));
    console.log("\n  restored the previous row");
  } else {
    await db.delete(appSettings).where(eq(appSettings.key, KEY));
    console.log("\n  removed the test row");
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}
void main();
