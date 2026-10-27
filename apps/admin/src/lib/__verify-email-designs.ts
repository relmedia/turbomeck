/**
 * Round-trips a design through the database and checks the activation rule.
 *
 * The rule worth testing is the partial unique index: at most one ACTIVE
 * design per (templateKey, locale). Without it, two active designs for the
 * same email is an ambiguity settled by whichever row the query returns
 * first — a bug that would show up as "it keeps sending the old template".
 *
 * Creates and deletes its own rows.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@*\/node_modules/tsx/dist/cli.mjs \
 *     --tsconfig apps/admin/tsconfig.json --env-file=apps/admin/.env \
 *     apps/admin/src/lib/__verify-email-designs.ts
 */

import { db } from "@repo/database";
import { emailDesigns } from "@repo/database/schema";
import { and, eq, inArray } from "drizzle-orm";

let failures = 0;
const check = (l: string, ok: boolean, d?: unknown) => {
  console.log(`${ok ? "  OK  " : " FAIL "} ${l}${d !== undefined ? ` — ${JSON.stringify(d)}` : ""}`);
  if (!ok) failures++;
};

const KEY = "__verify_tmp_key";
const created: number[] = [];

async function main() {
  const design = { counters: { u_row: 1 }, body: { rows: [] }, schemaVersion: 16 };

  const [a] = await db
    .insert(emailDesigns)
    .values({
      name: "Probe A", locale: "sv", templateKey: KEY,
      subject: "Ämne A", design, html: "<html>A</html>", isActive: true,
    })
    .returning({ id: emailDesigns.id });
  if (a) created.push(a.id);
  check("insert an active design", Boolean(a?.id));

  const [readBack] = await db.select().from(emailDesigns).where(eq(emailDesigns.id, a!.id)).limit(1);
  /**
   * Compared structurally, not by stringify: Postgres `jsonb` normalises key
   * order, so a byte comparison fails on data that is perfectly intact. What
   * matters is that every value comes back.
   */
  const rt = readBack?.design as typeof design | null;
  check(
    "design JSON survives the round trip",
    rt?.schemaVersion === design.schemaVersion &&
      rt?.counters?.u_row === design.counters.u_row &&
      Array.isArray(rt?.body?.rows),
    { stored: rt },
  );
  check("html survives", readBack?.html === "<html>A</html>");
  check("isActive stored", readBack?.isActive === true);

  /** A second ACTIVE design for the same key+locale must be rejected. */
  let rejected = false;
  try {
    const [b] = await db
      .insert(emailDesigns)
      .values({
        name: "Probe B", locale: "sv", templateKey: KEY,
        subject: "Ämne B", design, html: "<html>B</html>", isActive: true,
      })
      .returning({ id: emailDesigns.id });
    if (b) created.push(b.id);
  } catch {
    rejected = true;
  }
  check("a SECOND active design for the same key is rejected", rejected);

  /** An inactive one is fine — drafts are unconstrained. */
  const [c] = await db
    .insert(emailDesigns)
    .values({
      name: "Probe C", locale: "sv", templateKey: KEY,
      subject: "Ämne C", design, html: "<html>C</html>", isActive: false,
    })
    .returning({ id: emailDesigns.id });
  if (c) created.push(c.id);
  check("an INACTIVE draft for the same key is allowed", Boolean(c?.id));

  /** The other locale is a separate slot. */
  const [d] = await db
    .insert(emailDesigns)
    .values({
      name: "Probe EN", locale: "en", templateKey: KEY,
      subject: "Subject", design, html: "<html>EN</html>", isActive: true,
    })
    .returning({ id: emailDesigns.id });
  if (d) created.push(d.id);
  check("the other locale can be active independently", Boolean(d?.id));

  /** Standalone designs (null key) are never constrained. */
  const standalone: number[] = [];
  for (let i = 0; i < 2; i++) {
    const [s] = await db
      .insert(emailDesigns)
      .values({ name: `Fristående ${i}`, locale: "sv", templateKey: null, subject: "", design, html: "", isActive: true })
      .returning({ id: emailDesigns.id });
    if (s) { created.push(s.id); standalone.push(s.id); }
  }
  check("two active STANDALONE designs are allowed", standalone.length === 2);

  /** The swap the API performs: stand the old one down, then activate. */
  await db.update(emailDesigns).set({ isActive: false })
    .where(and(eq(emailDesigns.templateKey, KEY), eq(emailDesigns.locale, "sv"), eq(emailDesigns.isActive, true)));
  await db.update(emailDesigns).set({ isActive: true }).where(eq(emailDesigns.id, c!.id));
  const active = await db.select({ id: emailDesigns.id }).from(emailDesigns)
    .where(and(eq(emailDesigns.templateKey, KEY), eq(emailDesigns.locale, "sv"), eq(emailDesigns.isActive, true)));
  check("after a swap exactly one is active", active.length === 1 && active[0]?.id === c!.id, active);

  if (created.length) await db.delete(emailDesigns).where(inArray(emailDesigns.id, created));
  const left = await db.select({ id: emailDesigns.id }).from(emailDesigns).where(eq(emailDesigns.templateKey, KEY));
  check("cleaned up", left.length === 0);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
