/**
 * Repair script for the case where R2 product images were re-uploaded as .avif but
 * the Postgres `products.image` / `products.thumbnails` columns still reference the
 * deleted .png URLs (storefront renders 404 from r2.dev).
 *
 * Strategy:
 *   1) Read each product's image + thumbnail URLs from DB.
 *   2) For every .png/.jpg/.jpeg/.webp URL:
 *        - rewrite the extension to .avif (same canonical filename)
 *        - HEAD-check against R2; if the .avif object exists, update the DB
 *        - if no .avif exists, leave the URL alone (or mark it for re-upload)
 *   3) Print a summary and a list of products that still have missing images.
 *
 * Run from repo root:
 *   pnpm --filter product-service rewrite-png-to-avif        # dry-run (default)
 *   pnpm --filter product-service rewrite-png-to-avif -- --apply
 */

import { db } from "@repo/database";
import { products } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import {
  S3Client,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const apply = process.argv.includes("--apply");

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "turbomeck";
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PUBLIC_URL) {
  console.error("Missing R2_* env. Aborting.");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const RASTER_RE = /\.(png|jpe?g|webp)(\?[^/]*)?$/i;

function pathnameOf(url: string): string | null {
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    return null;
  }
}

function rewriteExtToAvif(url: string): string {
  const u = new URL(url);
  u.pathname = u.pathname.replace(/\.(png|jpe?g|webp)$/i, ".avif");
  u.search = "";
  return u.toString();
}

const headCache = new Map<string, boolean>();
async function objectExists(key: string): Promise<boolean> {
  if (headCache.has(key)) return headCache.get(key)!;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    headCache.set(key, true);
    return true;
  } catch {
    headCache.set(key, false);
    return false;
  }
}

async function tryRewrite(url: string | null): Promise<string | null> {
  if (!url) return url;
  if (!url.startsWith(R2_PUBLIC_URL)) return url; // not our bucket
  if (!RASTER_RE.test(url)) return url; // already avif or unknown ext

  const candidate = rewriteExtToAvif(url);
  const candidateKey = pathnameOf(candidate);
  if (!candidateKey) return url;

  if (await objectExists(candidateKey)) {
    return candidate;
  }
  return url;
}

const all = await db
  .select({
    id: products.id,
    name: products.name,
    image: products.image,
    thumbnails: products.thumbnails,
  })
  .from(products);

let changedRows = 0;
let imagesFixed = 0;
let thumbsFixed = 0;
const stillMissing: Array<{ id: number; url: string }> = [];

for (const p of all) {
  const newImage = await tryRewrite(p.image);
  const oldThumbs = (p.thumbnails ?? []) as string[];
  const newThumbs: string[] = [];
  for (const t of oldThumbs) {
    const rewritten = (await tryRewrite(t)) ?? t;
    newThumbs.push(rewritten);
    if (rewritten !== t) thumbsFixed++;
  }

  const imageChanged = newImage !== p.image && newImage != null;
  const thumbsChanged =
    JSON.stringify(newThumbs) !== JSON.stringify(oldThumbs);

  if (imageChanged) imagesFixed++;
  if (imageChanged || thumbsChanged) {
    changedRows++;
    console.log(`#${p.id} ${p.name ?? ""}`.trim());
    if (imageChanged) console.log(`   image: ${p.image} -> ${newImage}`);
    if (thumbsChanged) {
      for (let i = 0; i < oldThumbs.length; i++) {
        if (oldThumbs[i] !== newThumbs[i])
          console.log(`   thumb[${i}]: ${oldThumbs[i]} -> ${newThumbs[i]}`);
      }
    }
    if (apply) {
      await db
        .update(products)
        .set({ image: newImage, thumbnails: newThumbs })
        .where(eq(products.id, p.id));
    }
  }

  // Gather still-broken URLs (after rewrite attempt) for reporting
  const finalImage = newImage ?? p.image;
  if (finalImage && finalImage.startsWith(R2_PUBLIC_URL)) {
    const key = pathnameOf(finalImage);
    if (key && !(await objectExists(key))) {
      stillMissing.push({ id: p.id, url: finalImage });
    }
  }
}

console.log();
console.log(apply ? "APPLIED to DB." : "DRY-RUN (no DB changes). Re-run with --apply to write.");
console.log(`  Rows changed : ${changedRows}`);
console.log(`  Images fixed : ${imagesFixed}`);
console.log(`  Thumbs fixed : ${thumbsFixed}`);
console.log(`  Still missing in R2 (after rewrite): ${stillMissing.length}`);
for (const m of stillMissing.slice(0, 20)) {
  console.log(`    #${m.id}: ${m.url}`);
}
if (stillMissing.length > 20) console.log(`    … ${stillMissing.length - 20} more`);

process.exit(0);
