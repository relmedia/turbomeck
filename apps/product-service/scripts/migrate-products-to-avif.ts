import path from "path";
import { fileURLToPath } from "url";

/**
 * Convert all product images stored on R2 to AVIF, update Postgres URLs, optionally delete old objects.
 *
 * Run (from repo root or apps/product-service):
 *   pnpm --filter product-service migrate-products-to-avif
 *
 * Flags:
 *   --force     Re-encode images that are already .avif (e.g. change quality/size)
 *   --delete-old  After a successful upload + DB update for that URL, delete the previous R2 object when the key changed (.png → .avif)
 *
 * Requires: R2_* env, DATABASE_URL
 */

import { db } from "@repo/database";
import { products } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import {
  processProductImageFromUrl,
  extractFilenameFromImageUrl,
} from "../src/image-utils.js";
import { isR2Configured, uploadToR2, deleteFromR2 } from "../src/r2-storage.js";

export type MigrateToAvifOptions = {
  force?: boolean;
  deleteOld?: boolean;
};

function isR2ImageUrl(url: string | null): boolean {
  if (!url || !url.startsWith("http")) return false;
  return url.includes("r2.dev") || url.includes("r2.cloudflarestorage.com");
}

function canonicalStorageUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString();
  } catch {
    return url.split("?")[0] ?? url;
  }
}

function pathnameFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    return "";
  }
}

function isAvifUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".avif");
  } catch {
    return url.toLowerCase().includes(".avif");
  }
}

function parseCliFlags(): MigrateToAvifOptions {
  const argv = process.argv.slice(2);
  return {
    force: argv.includes("--force"),
    deleteOld: argv.includes("--delete-old"),
  };
}

/**
 * Convert R2 product images to AVIF and rewrite URLs in the database.
 */
export async function migrateProductImagesToAvif(
  options: MigrateToAvifOptions = {}
): Promise<void> {
  const force = options.force ?? false;
  const deleteOld = options.deleteOld ?? false;

  if (!isR2Configured()) {
    console.error(
      "R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL"
    );
    process.exit(1);
  }

  const allProducts = await db
    .select({
      id: products.id,
      name: products.name,
      image: products.image,
      thumbnails: products.thumbnails,
    })
    .from(products);

  /** Map original or canonical URL → new public URL */
  const replacementMap = new Map<string, string>();

  const byCanonical = new Map<string, string>();
  for (const p of allProducts) {
    const urls: string[] = [];
    if (p.image) urls.push(p.image);
    const thumbs = (p.thumbnails ?? []) as string[];
    for (const t of thumbs) {
      if (t) urls.push(t);
    }
    for (const u of urls) {
      if (!isR2ImageUrl(u)) continue;
      if (!force && isAvifUrl(u)) continue;
      const key = canonicalStorageUrl(u);
      if (!byCanonical.has(key)) byCanonical.set(key, u);
    }
  }

  const toProcess = [...byCanonical.values()];
  console.log(
    `Found ${toProcess.length} unique R2 image URL(s) to convert to AVIF\n`
  );

  const oldKeysToDelete = new Set<string>();

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const url = toProcess[i];
    if (url === undefined) continue;
    const filename = extractFilenameFromImageUrl(url);
    if (!filename) {
      console.warn(`[${i + 1}/${toProcess.length}] Skip — invalid URL: ${url}`);
      failed++;
      continue;
    }

    process.stdout.write(`[${i + 1}/${toProcess.length}] ${filename} ... `);

    try {
      const { filename: outputFilename, buffer } =
        await processProductImageFromUrl(url);
      const newUrl = await uploadToR2(outputFilename, buffer, "image/avif");

      const can = canonicalStorageUrl(url);
      replacementMap.set(url, newUrl);
      replacementMap.set(can, newUrl);

      if (deleteOld) {
        const oldPath = pathnameFromUrl(url);
        const newPath = pathnameFromUrl(newUrl);
        if (oldPath && newPath && oldPath !== newPath) {
          oldKeysToDelete.add(oldPath);
        }
      }

      console.log("OK");
      processed++;
    } catch (err) {
      console.log("FAILED");
      console.error(
        `  ${err instanceof Error ? err.message : String(err)}`
      );
      failed++;
    }
  }

  function resolveUrl(u: string | null): string | null {
    if (!u) return null;
    const direct = replacementMap.get(u);
    if (direct) return direct;
    const viaCan = replacementMap.get(canonicalStorageUrl(u));
    if (viaCan) return viaCan;
    return u;
  }

  let rowsUpdated = 0;

  try {
    for (const p of allProducts) {
      const newImage = resolveUrl(p.image);
      const thumbs = (p.thumbnails ?? []) as string[];
      const newThumbs = thumbs.map((t) => resolveUrl(t) ?? t);

      const imageChanged = newImage !== p.image;
      const thumbsChanged =
        JSON.stringify(newThumbs) !== JSON.stringify(thumbs);

      if (!imageChanged && !thumbsChanged) continue;

      await db
        .update(products)
        .set({
          image: newImage,
          thumbnails: newThumbs,
        })
        .where(eq(products.id, p.id));
      rowsUpdated++;
    }
  } catch (err) {
    console.error(
      "\nDatabase update failed. Superseded R2 objects were NOT deleted.",
      err
    );
    throw err;
  }

  if (deleteOld && oldKeysToDelete.size > 0) {
    console.log(`\nDeleting ${oldKeysToDelete.size} superseded R2 object(s)...`);
    for (const key of oldKeysToDelete) {
      try {
        await deleteFromR2(key);
        console.log(`  deleted ${key}`);
      } catch (e) {
        console.warn(
          `  could not delete ${key}: ${e instanceof Error ? e.message : e}`
        );
      }
    }
  }

  console.log(
    `\nDone. Converted: ${processed}, Failed: ${failed}, Product rows updated: ${rowsUpdated}`
  );
}

async function main() {
  const flags = parseCliFlags();
  await migrateProductImagesToAvif(flags);
}

const entry = path.resolve(fileURLToPath(import.meta.url));
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === entry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
