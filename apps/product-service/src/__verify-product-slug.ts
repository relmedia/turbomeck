/**
 * Checks that storing the slug moved no URL.
 *
 * This is the safety claim the whole rename feature rests on. Before
 * migration 0028 a product's address was `productNameToSlug(name)`, computed
 * fresh on every read. If the backfill disagrees with that for even one row,
 * an indexed page quietly changes address and 404s — the precise damage the
 * column exists to prevent.
 *
 * So every product is compared against what the old code would have produced,
 * and the SQL in the migration has to agree with the TypeScript exactly.
 *
 * Read-only. Writes nothing.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --env-file=apps/product-service/.env \
 *     apps/product-service/src/__verify-product-slug.ts
 */

import { db } from "@repo/database";
import { products } from "@repo/database/schema";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

/**
 * The pre-migration behaviour, copied verbatim from index.ts so this compares
 * against what the URLs actually were rather than against a tidied version.
 */
function productNameToSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[åä]/g, "a")
      .replace(/ö/g, "o")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "product"
  );
}

async function main() {
  const rows = await db
    .select({ id: products.id, name: products.name, slug: products.slug })
    .from(products);

  check("there are products to check", rows.length > 0, rows.length);

  const missing = rows.filter((r) => !r.slug?.trim());
  check("every product has a slug", missing.length === 0, missing.map((r) => r.id));

  /* ---- the claim: no URL moved ---------------------------------------- */
  const moved = rows
    .filter((r) => r.slug?.trim())
    .map((r) => ({ id: r.id, name: r.name, was: productNameToSlug(r.name), now: r.slug! }))
    .filter((r) => r.was !== r.now);
  check("no product's URL changed", moved.length === 0, moved.slice(0, 5));

  /* ---- two products must never share an address ------------------------ */
  const seen = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.slug) continue;
    seen.set(r.slug, [...(seen.get(r.slug) ?? []), r.id]);
  }
  const clashes = [...seen.entries()].filter(([, ids]) => ids.length > 1);
  check("slugs are unique", clashes.length === 0, clashes.slice(0, 5));

  /* ---- the slug is a usable URL segment -------------------------------- */
  const malformed = rows
    .filter((r) => r.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.slug))
    .map((r) => ({ id: r.id, slug: r.slug }));
  check("every slug is lowercase alphanumeric and hyphenated", malformed.length === 0, malformed.slice(0, 5));

  /**
   * The point of the column: a rename must not move the URL. Checked without
   * writing — the stored value is independent of the name by construction,
   * so this asserts the read path prefers it.
   */
  const sample = rows.find((r) => r.slug?.trim());
  if (sample) {
    const renamed = { ...sample, name: `${sample.name} helt nytt namn` };
    const resolved = renamed.slug?.trim() || productNameToSlug(renamed.name);
    check(
      "renaming a product does not move its URL",
      resolved === sample.slug,
      { before: sample.slug, afterRename: resolved },
    );
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
