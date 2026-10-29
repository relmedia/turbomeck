/**
 * Scores the whole live catalogue the way the products table will.
 *
 * The table shows one number per product, so the number has to be meaningful
 * across the real data — not just on the handful of names the unit harness
 * uses. Two things would make the column useless and neither shows up in a
 * fixture test: every product scoring the same (the column says nothing), or
 * scores collapsing to zero because a finding fires on all 61 (the column
 * says everything is broken).
 *
 * It also prints the distribution, which is the actual answer to "how much
 * work is there" — the reason the column was asked for.
 *
 * Read-only.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --tsconfig apps/admin/tsconfig.json --env-file=apps/admin/.env \
 *     apps/admin/src/lib/__verify-catalogue-seo.ts
 */

import { db } from "@repo/database";
import { products } from "@repo/database/schema";
import { scoreSeo } from "./seo-score";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

async function main() {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      shortDescription: products.shortDescription,
      nameEn: products.nameEn,
      shortDescriptionEn: products.shortDescriptionEn,
    })
    .from(products);

  check("there are products to score", rows.length > 0, rows.length);

  /** Exactly what the list page does before handing rows to the table. */
  const scored = rows.map((p, i) => {
    const others = rows
      .filter((_, j) => j !== i)
      .map((o) => ({ name: o.name, shortDescription: o.shortDescription }));
    return {
      id: p.id,
      name: p.name,
      ...scoreSeo({
        name: p.name ?? "",
        shortDescription: p.shortDescription ?? "",
        nameEn: p.nameEn ?? "",
        shortDescriptionEn: p.shortDescriptionEn ?? "",
        others,
      }),
    };
  });

  /* ---- the column has to discriminate --------------------------------- */
  const values = scored.map((s) => s.score);
  const distinct = new Set(values);
  check("scores are not all identical", distinct.size > 1, { distinct: distinct.size });
  check("scores are in range", values.every((v) => v >= 0 && v <= 100));
  check("nothing scores zero", !values.includes(0), scored.filter((s) => s.score === 0).map((s) => s.name));

  const min = Math.min(...values);
  const max = Math.max(...values);
  check("there is a real spread between best and worst", max - min >= 12, { min, max });

  /* ---- no finding fires on everything ---------------------------------- */
  const counts = new Map<string, number>();
  for (const s of scored) {
    for (const f of s.findings) {
      if (f.severity === "good") continue;
      counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
    }
  }
  const universal = [...counts.entries()].filter(([, n]) => n === rows.length).map(([id]) => id);
  /**
   * A finding on every single product is advice nobody can act on and drags
   * every score down by the same amount, which flattens the column.
   */
  check("no warning fires on every product", universal.length === 0, universal);

  /* ---- duplicates: the thing only a list can see ----------------------- */
  const dupes = scored.filter((s) => s.findings.some((f) => f.id === "dup-name" || f.id === "dup-meta"));
  check("duplicate detection ran without false positives", dupes.length === 0, dupes.map((s) => s.name));

  /* ---- the report ------------------------------------------------------ */
  const buckets = { "0-39": 0, "40-54": 0, "55-79": 0, "80-100": 0 };
  for (const v of values) {
    if (v < 40) buckets["0-39"]++;
    else if (v < 55) buckets["40-54"]++;
    else if (v < 80) buckets["55-79"]++;
    else buckets["80-100"]++;
  }
  console.log(`\n  distribution across ${rows.length} products: ${JSON.stringify(buckets)}`);
  console.log(`  average ${Math.round(values.reduce((a, b) => a + b, 0) / values.length)}, worst ${min}, best ${max}`);

  console.log("\n  most common problems:");
  for (const [id, n] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    console.log(`    ${String(n).padStart(3)}x  ${id}`);
  }

  console.log("\n  five weakest listings:");
  for (const s of [...scored].sort((a, b) => a.score - b.score).slice(0, 5)) {
    console.log(`    ${String(s.score).padStart(3)}  ${s.name}`);
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
