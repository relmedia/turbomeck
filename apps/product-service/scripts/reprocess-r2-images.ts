/**
 * Reprocess existing product images in Cloudflare R2: resize and re-upload.
 * Run: pnpm --filter product-service reprocess-r2-images
 *
 * Requires:
 *   R2_* - Cloudflare R2 credentials
 *   DATABASE_URL - Database connection
 */

import { db } from "@repo/database";
import { products } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import {
  processProductImageFromUrl,
  extractFilenameFromImageUrl,
} from "../src/image-utils.js";
import { isR2Configured, uploadToR2 } from "../src/r2-storage.js";

function isR2ImageUrl(url: string | null): boolean {
  if (!url || !url.startsWith("http")) return false;
  return url.includes("r2.dev") || url.includes("r2.cloudflarestorage.com");
}

async function main() {
  if (!isR2Configured()) {
    console.error("R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL");
    process.exit(1);
  }

  const allProducts = await db.select({ id: products.id, name: products.name, image: products.image, thumbnails: products.thumbnails }).from(products);

  const urlSet = new Set<string>();
  for (const p of allProducts) {
    if (p.image && isR2ImageUrl(p.image)) urlSet.add(p.image);
    const thumbs = (p.thumbnails ?? []) as string[];
    for (const t of thumbs) {
      if (t && isR2ImageUrl(t)) urlSet.add(t);
    }
  }

  const urls = Array.from(urlSet);
  console.log(`Found ${urls.length} unique R2 image(s) to reprocess\n`);

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const filename = extractFilenameFromImageUrl(url);
    if (!filename) {
      console.warn(`[${i + 1}/${urls.length}] Skip - invalid URL: ${url}`);
      failed++;
      continue;
    }

    process.stdout.write(`[${i + 1}/${urls.length}] ${filename} ... `);

    try {
      const { filename: outputFilename, buffer } = await processProductImageFromUrl(url);
      await uploadToR2(outputFilename, buffer, "image/png");
      console.log("OK");
      processed++;
    } catch (err) {
      console.log("FAILED");
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\nDone. Processed: ${processed}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
