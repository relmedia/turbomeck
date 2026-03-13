import fs from "fs";
import path from "path";

const TARGET_SIZE = 1200;

/** Resize and save as PNG using Sharp (fast, native). Uses "contain" to avoid cropping. */
async function resizeWithSharp(buffer: Buffer, outputPath: string): Promise<void> {
  const sharp = (await import("sharp")).default;
  await sharp(buffer)
    .resize(TARGET_SIZE, TARGET_SIZE, { fit: "inside" })
    .png({ compressionLevel: 6 })
    .toFile(outputPath);
}

/** Fallback: resize with Jimp (pure JS, works when Sharp fails on Windows). */
async function resizeWithJimp(buffer: Buffer, outputPath: string): Promise<void> {
  const { default: Jimp } = await import("jimp");
  const image = await Jimp.read(buffer);
  image.background(0xffffffff);
  const contained = image.contain(TARGET_SIZE, TARGET_SIZE);
  await contained.writeAsync(outputPath);
}

/** Result of processing a product image - either file path or buffer for R2 upload. */
export type ProcessProductImageResult =
  | { outputPath: string; filename: string; buffer?: undefined }
  | { outputPath?: undefined; filename: string; buffer: Buffer };

/**
 * Process product image: resize to square.
 * Uses Sharp when available; falls back to Jimp on Windows if Sharp fails (ERR_DLOPEN).
 * When returnBuffer is true, returns buffer instead of writing to disk (for R2 upload).
 */
export async function processProductImage(
  inputPath: string,
  returnBuffer = false
): Promise<ProcessProductImageResult> {
  const ext = path.extname(inputPath);
  const baseName = path.basename(inputPath, ext);
  const dir = path.dirname(inputPath);
  const outputFilename = `${baseName}.png`;
  const outputPath = path.join(dir, outputFilename);

  const imageBuffer = fs.readFileSync(inputPath);

  let finalBuffer: Buffer | undefined;
  try {
    if (returnBuffer) {
      const sharp = (await import("sharp")).default;
      finalBuffer = await sharp(imageBuffer)
        .resize(TARGET_SIZE, TARGET_SIZE, { fit: "inside" })
        .png({ compressionLevel: 6 })
        .toBuffer();
    } else {
      await resizeWithSharp(imageBuffer, outputPath);
    }
  } catch (sharpErr) {
    const msg = String(sharpErr);
    if (msg.includes("ERR_DLOPEN_FAILED") || msg.includes("Could not load the \"sharp\"")) {
      if (returnBuffer) {
        const { default: Jimp } = await import("jimp");
        const image = await Jimp.read(imageBuffer);
        const scaled = image.scaleToFit(TARGET_SIZE, TARGET_SIZE);
        finalBuffer = await scaled.getBufferAsync("image/png");
      } else {
        await resizeWithJimp(imageBuffer, outputPath);
      }
    } else {
      throw sharpErr;
    }
  }

  if (returnBuffer && !finalBuffer) {
    throw new Error("Failed to process image to buffer");
  }

  if (!returnBuffer) {
    if (path.resolve(inputPath) !== path.resolve(outputPath)) {
      fs.unlinkSync(inputPath);
    }
    return { outputPath, filename: outputFilename };
  }

  if (path.resolve(inputPath) !== path.resolve(outputPath)) {
    try {
      fs.unlinkSync(inputPath);
    } catch {
      /* ignore */
    }
  }

  return { filename: outputFilename, buffer: finalBuffer! };
}
