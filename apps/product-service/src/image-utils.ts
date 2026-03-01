import fs from "fs";
import path from "path";
import { removeBackground } from "@imgly/background-removal-node";
import sharp from "sharp";

/**
 * Process product image: remove background + resize to square.
 * Used by upload endpoint and reprocess script.
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

  const TARGET_SIZE = 1200;
  await sharp(imageBuffer)
    .resize(TARGET_SIZE, TARGET_SIZE, { fit: "cover", position: "center" })
    .png({ compressionLevel: 6 })
    .toFile(outputPath);

  if (path.resolve(inputPath) !== path.resolve(outputPath)) {
    fs.unlinkSync(inputPath);
  }

  return { outputPath, filename: outputFilename };
}
