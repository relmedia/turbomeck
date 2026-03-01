/**
 * Reprocess all product images: remove background + resize.
 * Run: pnpm --filter product-service reprocess-images
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db } from "@repo/database";
import { products } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { processProductImage } from "../src/image-utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.resolve(__dirname, "../../admin/public/uploads");

async function main() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    console.error("Uploads directory not found:", UPLOAD_DIR);
    process.exit(1);
  }

  const allProducts = await db.select().from(products);
  console.log(`Found ${allProducts.length} products to process\n`);

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < allProducts.length; i++) {
    const product = allProducts[i];
    const name = product.name;
    const imagePath = product.image;
    const thumbnails = (product as { thumbnails?: string[] }).thumbnails ?? [];

    const toProcess: string[] = [];
    if (imagePath) toProcess.push(imagePath);
    thumbnails.forEach((t) => toProcess.push(t));

    if (toProcess.length === 0) {
      console.log(`[${i + 1}/${allProducts.length}] ${name} - no images, skip`);
      continue;
    }

    console.log(`[${i + 1}/${allProducts.length}] ${name} - ${toProcess.length} image(s)`);

    const newImagePaths: string[] = [];
    let hasError = false;

    for (const relPath of toProcess) {
      const filename = relPath.replace(/^\/uploads\//, "");
      const fullPath = path.join(UPLOAD_DIR, filename);

      if (!fs.existsSync(fullPath)) {
        console.warn(`  File not found: ${filename}`);
        hasError = true;
        continue;
      }

      try {
        const { filename: newFilename } = await processProductImage(fullPath);
        newImagePaths.push(`/uploads/${newFilename}`);
      } catch (err) {
        console.warn(`  Failed: ${filename}`, err);
        hasError = true;
      }
    }

    if (hasError) failed++;

    const newMainImage = newImagePaths[0] ?? imagePath;
    const newThumbnails = newImagePaths.slice(1);

    await db
      .update(products)
      .set({
        image: newMainImage,
        thumbnails: newThumbnails,
        updatedAt: new Date(),
      })
      .where(eq(products.id, product.id));

    processed++;
  }

  console.log(`\nDone. Processed: ${processed}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
