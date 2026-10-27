/**
 * Writes every seeded design to a directory so the real editor can be asked
 * whether it opens them.
 *
 * Generated design JSON that is subtly wrong does not error — it opens blank.
 * That failure is invisible to any test that only checks the JSON, so the
 * designs go through the live Unlayer build before they go near the database.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     apps/product-service/src/__dump-seed-designs.ts <out-dir>
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { seedTemplates } from "./email-designs-seed.js";

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: __dump-seed-designs.ts <out-dir>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const templates = seedTemplates();
const index: Array<{ file: string; templateKey: string; locale: string; rows: number }> = [];

for (const t of templates) {
  const file = `${t.templateKey}.${t.locale}.json`;
  writeFileSync(join(outDir, file), JSON.stringify(t.design, null, 2), "utf8");
  const rows = (t.design as { body: { rows: unknown[] } }).body.rows.length;
  index.push({ file, templateKey: t.templateKey, locale: t.locale, rows });
  console.log(`${file}  rows=${rows}  subject="${t.subject}"`);
}

writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2), "utf8");
console.log(`\n${templates.length} designs written to ${outDir}`);

/** Ids must be unique inside a design or the editor drops the duplicates. */
for (const t of templates) {
  const ids: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      const o = node as Record<string, unknown>;
      if (typeof o.id === "string") ids.push(o.id);
      Object.values(o).forEach(walk);
    }
  };
  walk(t.design);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) {
    console.error(`DUPLICATE ids in ${t.templateKey}.${t.locale}: ${dupes.join(", ")}`);
    process.exit(1);
  }
}
console.log("every design has unique ids");
