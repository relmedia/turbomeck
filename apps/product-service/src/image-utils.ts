import fs from "fs";
import path from "path";
import { removeBackground } from "@imgly/background-removal-node";

const TARGET_SIZE = 1200;

/** Resize and save as PNG using Sharp (fast, native). */
async function resizeWithSharp(buffer: Buffer, outputPath: string): Promise<void> {
  const sharp = (await import("sharp")).default;
  await sharp(buffer)
    .resize(TARGET_SIZE, TARGET_SIZE, { fit: "cover", position: "center" })
    .png({ compressionLevel: 6 })
    .toFile(outputPath);
}

/** Fallback: resize with Jimp (pure JS, works when Sharp fails on Windows). */
async function resizeWithJimp(buffer: Buffer, outputPath: string): Promise<void> {
  const { default: Jimp } = await import("jimp");
  const image = await Jimp.read(buffer);
  await image.cover(TARGET_SIZE, TARGET_SIZE).writeAsync(outputPath);
}

/**
 * Process product image: remove background + resize to square.
 * Uses Sharp when available; falls back to Jimp on Windows if Sharp fails (ERR_DLOPEN).
 */
export async function processProductImage(inputPath: string): Promise<{ outputPath: string; filename: string }> {
  const ext = path.extname(inputPath);
  const baseName = path.basename(inputPath, ext);
  const dir = path.dirname(inputPath);
  const outputFilename = `${baseName}.png`;
  const outputPath = path.join(dir, outputFilename);

  let imageBuffer: Buffer;

  const inputBuffer = fs.readFileSync(inputPath);
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  const mimeType = mimeTypes[ext.toLowerCase()] || "image/jpeg";

  try {
    const inputBlob = new Blob([inputBuffer], { type: mimeType });
    const blob = await removeBackground(inputBlob, {
      model: "small",
      output: { format: "image/png", quality: 0.9 },
    });
    imageBuffer = Buffer.from(await blob.arrayBuffer());
  } catch (err) {
    console.warn("Background removal failed, using original image:", err);
    imageBuffer = inputBuffer;
  }

  try {
    await resizeWithSharp(imageBuffer, outputPath);
  } catch (sharpErr) {
    const msg = String(sharpErr);
    if (msg.includes("ERR_DLOPEN_FAILED") || msg.includes("Could not load the \"sharp\"")) {
      await resizeWithJimp(imageBuffer, outputPath);
    } else {
      throw sharpErr;
    }
  }

  if (path.resolve(inputPath) !== path.resolve(outputPath)) {
    fs.unlinkSync(inputPath);
  }

  return { outputPath, filename: outputFilename };
}
