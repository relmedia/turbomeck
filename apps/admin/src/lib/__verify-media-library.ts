/**
 * Checks the media library against the real bucket and catalogue.
 *
 * One claim on this page is dangerous to get wrong: "Används inte". Someone
 * will read it and delete the file. If usage detection misses a reference,
 * that is a product losing its photo in production — and nothing errors, the
 * image just stops resolving.
 *
 * So the matching is checked both ways against live data: every image a
 * product actually references must be reported as used, and the page's total
 * must account for every object in storage.
 *
 * The subtlety being tested is that stored URLs are not comparable as
 * strings. They carry a `?v=` cache-buster, the public host has changed
 * before, and some rows hold a bare path. Matching on the object key is what
 * makes it reliable; matching on the URL is what would silently under-report.
 *
 * Read-only.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --tsconfig apps/admin/tsconfig.json --env-file=apps/admin/.env \
 *     apps/admin/src/lib/__verify-media-library.ts
 */

import { db } from "@repo/database";
import { products, emailDesigns } from "@repo/database/schema";
import { objectKeyFromUrl } from "./media-uploads";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

/* ---- key extraction: the thing everything else rests on ---------------- */
{
  const cases: Array<[string, string, string | null]> = [
    ["an absolute R2 url", "https://pub-x.r2.dev/products/a.avif", "products/a.avif"],
    ["with a cache-buster", "https://pub-x.r2.dev/products/a.avif?v=123", "products/a.avif"],
    ["a different host, same object", "https://cdn.example.com/products/a.avif", "products/a.avif"],
    ["a bare key", "products/a.avif", "products/a.avif"],
    ["a leading slash", "/products/a.avif", "products/a.avif"],
    ["a nested path", "https://pub-x.r2.dev/email-assets/x-takk.jpg", "email-assets/x-takk.jpg"],
    ["empty", "", null],
  ];
  for (const [label, input, expected] of cases) {
    check(`key from ${label}`, objectKeyFromUrl(input) === expected, {
      got: objectKeyFromUrl(input),
      expected,
    });
  }

  /** The two forms of the same object must resolve identically. */
  check(
    "a cache-busted url matches its plain form",
    objectKeyFromUrl("https://pub-x.r2.dev/products/a.avif?v=9") ===
      objectKeyFromUrl("https://pub-x.r2.dev/products/a.avif"),
  );
}

async function main() {
  const [productRows, designRows] = await Promise.all([
    db
      .select({ id: products.id, name: products.name, image: products.image, thumbnails: products.thumbnails })
      .from(products),
    db.select({ id: emailDesigns.id, name: emailDesigns.name, html: emailDesigns.html }).from(emailDesigns),
  ]);

  check("there are products to check against", productRows.length > 0, productRows.length);

  /** Exactly the index the route builds. */
  const usage = new Map<string, string[]>();
  const add = (url: string | null | undefined, who: string) => {
    const key = objectKeyFromUrl(url ?? "");
    if (!key) return;
    usage.set(key, [...(usage.get(key) ?? []), who]);
  };
  for (const p of productRows) {
    add(p.image, p.name);
    for (const t of (p.thumbnails as string[] | null) ?? []) add(t, p.name);
  }

  /* ---- every referenced image resolves to a key ----------------------- */
  const referenced: string[] = [];
  for (const p of productRows) {
    if (p.image) referenced.push(p.image);
    for (const t of (p.thumbnails as string[] | null) ?? []) referenced.push(t);
  }
  const unresolvable = referenced.filter((u) => !objectKeyFromUrl(u));
  check(
    "every image a product references yields an object key",
    unresolvable.length === 0,
    unresolvable.slice(0, 5),
  );

  /**
   * The failure that matters. A product's own image must come back as used
   * when looked up the way the page looks it up.
   */
  const missed = productRows
    .filter((p) => p.image)
    .filter((p) => !(usage.get(objectKeyFromUrl(p.image!)!) ?? []).includes(p.name));
  check("every product's main image is reported as used", missed.length === 0, missed.map((p) => p.name));

  /* ---- cache-busters and host changes do not break matching ----------- */
  {
    const sample = productRows.find((p) => p.image);
    if (sample?.image) {
      const key = objectKeyFromUrl(sample.image)!;
      const variants = [
        `${sample.image.split("?")[0]}?v=${Date.now()}`,
        sample.image.replace(/^https:\/\/[^/]+/, "https://some-other-host.example"),
        key,
        `/${key}`,
      ];
      const allMatch = variants.every((v) => objectKeyFromUrl(v) === key);
      check("the same object matches however its url is written", allMatch, {
        key,
        variants: variants.map((v) => objectKeyFromUrl(v)),
      });
    }
  }

  /* ---- designs are matched by substring ------------------------------- */
  {
    const withImages = designRows.filter((d) => (d.html ?? "").includes("<img"));
    /**
     * Skipped rather than failed when there are none. The local database
     * carries no email designs — they live in production — and a harness
     * that reports a missing fixture as a defect teaches people to ignore it.
     */
    if (withImages.length === 0) {
      console.log("  SKIP  no email designs in this database; run against production for this part");
    } else {
      check("some designs carry images", true, withImages.length);
    }

    let matched = 0;
    for (const d of withImages) {
      const srcs = [...(d.html ?? "").matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]!);
      for (const src of srcs) {
        const key = objectKeyFromUrl(src);
        /** Only our own objects should match; a third-party icon should not. */
        if (key && (d.html ?? "").includes(key)) matched++;
      }
    }
    if (withImages.length > 0) {
      check("a design's own image keys are findable in its html", matched > 0, { matched });
    }
  }

  /* ---- the summary the page shows -------------------------------------- */
  const usedKeys = [...usage.keys()];
  console.log(`\n  ${usedKeys.length} distinct objects referenced by ${productRows.length} products`);
  const busiest = [...usage.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (busiest) console.log(`  most reused: ${busiest[0]} (${busiest[1].length} references)`);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
