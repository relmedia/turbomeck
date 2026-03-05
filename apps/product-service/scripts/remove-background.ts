/**
 * Remove background from images using AI (@imgly/background-removal-node).
 *
 * Usage (from repo root):
 *   pnpm remove-bg
 *     → Process all product images from DB (same as reprocess-images)
 *
 *   pnpm remove-bg --folder ./path/to/images
 *     → Process all images in a folder (for batches before adding to products)
 *
 * Output: Replaces images with PNG (transparent background), 1200x1200.
 * Skips "avatars" subfolder.
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

const DEFAULT_UPLOADS = path.resolve(__dirname, "../../admin/public/uploads");

async function processFromDb() {
  const allProducts = await db.select().from(products);
  console.log(`Processing ${allProducts.length} products (images from DB)\n`);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < allProducts.length; i++) {
    const product = allProducts[i];
    const imagePath = product.image;
    const thumbnails = (product as { thumbnails?: string[] }).thumbnails ?? [];
    const toProcess: string[] = [];
    if (imagePath) toProcess.push(imagePath);
    thumbnails.forEach((t) => toProcess.push(t));

    if (toProcess.length === 0) continue;

    process.stdout.write(`[${i + 1}/${allProducts.length}] ${product.name} ... `);
    const newPaths: string[] = [];
    let hasError = false;

    for (const relPath of toProcess) {
      const filename = relPath.replace(/^\/uploads\//, "").replace(/^uploads\//, "");
      const fullPath = path.join(DEFAULT_UPLOADS, filename);
      if (!fs.existsSync(fullPath)) {
        console.warn(`\n  File not found: ${fullPath} (DB path: ${relPath})`);
        hasError = true;
        continue;
      }
      try {
        const { filename: newFilename } = await processProductImage(fullPath);
        newPaths.push(`/uploads/${newFilename}`);
      } catch (err) {
        console.warn(`\n  Processing failed:`, err);
        hasError = true;
      }
    }

    const newMain = newPaths[0] ?? imagePath;
    const newThumbs = newPaths.slice(1);
    await db
      .update(products)
      .set({ image: newMain, thumbnails: newThumbs, updatedAt: new Date() })
      .where(eq(products.id, product.id));

    if (hasError) fail++;
    else ok++;
    console.log(hasError ? "SKIP" : "OK");
  }

  console.log(`\nDone. OK: ${ok}, Failed: ${fail}`);
}

async function removeBackgroundFromBlob(
  inputBuffer: Buffer,
  mimeType: string
): Promise<Buffer> {
  const { removeBackground } = await import("@imgly/background-removal-node");
  const inputBlob = new Blob([inputBuffer], { type: mimeType });
  const blob = await removeBackground(inputBlob, {
    model: "small",
    output: { format: "image/png", quality: 0.9 },
  });
  return Buffer.from(await blob.arrayBuffer());
}

async function processImage(inputPath: string, outputPath: string): Promise<boolean> {
  const ext = path.extname(inputPath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  const mimeType = mimeTypes[ext] || "image/jpeg";

  const inputBuffer = fs.readFileSync(inputPath);
  let outputBuffer: Buffer;

  try {
    outputBuffer = await removeBackgroundFromBlob(inputBuffer, mimeType);
  } catch (err) {
    console.warn(`  Background removal failed: ${err}`);
    return false;
  }

  const TARGET_SIZE = 1200;
  try {
    const sharp = (await import("sharp")).default;
    await sharp(outputBuffer)
      .resize(TARGET_SIZE, TARGET_SIZE, { fit: "cover", position: "center" })
      .png({ compressionLevel: 6 })
      .toFile(outputPath);
  } catch (sharpErr) {
    const msg = String(sharpErr);
    if (msg.includes("ERR_DLOPEN_FAILED") || msg.includes("Could not load the \"sharp\"")) {
      const { default: Jimp } = await import("jimp");
      const image = await Jimp.read(outputBuffer);
      await image.cover(TARGET_SIZE, TARGET_SIZE).writeAsync(outputPath);
    } else {
      throw sharpErr;
    }
  }

  if (path.resolve(inputPath) !== path.resolve(outputPath)) {
    fs.unlinkSync(inputPath);
  }
  return true;
}

function collectImageFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const exts = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== "avatars") {
      collectImageFiles(full, files);
    } else if (e.isFile() && exts.has(path.extname(e.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const args = process.argv.slice(2);
  const folderIdx = args.indexOf("--folder");

  if (folderIdx < 0 || !args[folderIdx + 1]) {
    await processFromDb();
    return;
  }

  const targetDir = path.resolve(process.cwd(), args[folderIdx + 1]);
  if (!fs.existsSync(targetDir)) {
    console.error("Directory not found:", targetDir);
    process.exit(1);
  }

  const imageFiles = collectImageFiles(targetDir);
  console.log(`Found ${imageFiles.length} image(s) in ${targetDir}\n`);

  if (imageFiles.length === 0) {
    console.log("No images to process.");
    return;
  }

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < imageFiles.length; i++) {
    const inputPath = imageFiles[i];
    const ext = path.extname(inputPath);
    const baseName = path.basename(inputPath, ext);
    const dir = path.dirname(inputPath);
    const outputPath = path.join(dir, `${baseName}.png`);
    const rel = path.relative(process.cwd(), inputPath);

    process.stdout.write(`[${i + 1}/${imageFiles.length}] ${rel} ... `);
    try {
      const success = await processImage(inputPath, outputPath);
      if (success) {
        console.log("OK");
        ok++;
      } else {
        console.log("SKIP");
        fail++;
      }
    } catch (err) {
      console.log("FAIL");
      console.warn("  ", err);
      fail++;
    }
  }

  console.log(`\nDone. OK: ${ok}, Failed/Skipped: ${fail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
