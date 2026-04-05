import fs from "fs";
import path from "path";
import { removeBackground } from "@imgly/background-removal-node";
import { assertAllowedRemoveBackgroundUrl } from "./safe-image-fetch-url.js";

const TARGET_SIZE = 1200;

/** Max dimension fed to background-removal (model & memory; avoids huge inputs). */
const REMOVE_BG_MAX_EDGE = 2048;

/** AVIF output tuned for product photos (good compression, acceptable CPU). */
const AVIF_OPTIONS = { quality: 62, effort: 4 } as const;

/**
 * `@imgly/background-removal-node` only accepts a small set of raster formats.
 * Product images are often AVIF/WebP; normalize to PNG before calling the model.
 */
async function toPngForBackgroundRemoval(imageBuffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(imageBuffer)
    .rotate()
    .resize(REMOVE_BG_MAX_EDGE, REMOVE_BG_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .png({ compressionLevel: 6 })
    .toBuffer();
}

/** Result of processing a product image - either file path or buffer for R2 upload. */
export type ProcessProductImageResult =
  | { outputPath: string; filename: string; buffer?: undefined }
  | { outputPath?: undefined; filename: string; buffer: Buffer };

/**
 * Resize and encode product image as AVIF (supports alpha for cut-outs).
 */
export async function encodeProductImageToAvif(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(buffer)
    .resize(TARGET_SIZE, TARGET_SIZE, { fit: "inside" })
    .avif(AVIF_OPTIONS)
    .toBuffer();
}

/**
 * Process product image: resize to square.
 * When returnBuffer is true, returns buffer for R2 upload.
 */
export async function processProductImage(
  inputPath: string,
  returnBuffer = false
): Promise<ProcessProductImageResult> {
  const ext = path.extname(inputPath);
  const baseName = path.basename(inputPath, ext);
  const dir = path.dirname(inputPath);
  const outputFilename = `${baseName}.avif`;
  const outputPath = path.join(dir, outputFilename);

  const imageBuffer = fs.readFileSync(inputPath);

  let finalBuffer: Buffer;
  try {
    finalBuffer = await encodeProductImageToAvif(imageBuffer);
  } catch (sharpErr) {
    throw sharpErr;
  }

  if (!returnBuffer) {
    fs.writeFileSync(outputPath, finalBuffer);
    if (path.resolve(inputPath) !== path.resolve(outputPath)) {
      try {
        fs.unlinkSync(inputPath);
      } catch {
        /* ignore */
      }
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

  return { filename: outputFilename, buffer: finalBuffer as Buffer };
}

/**
 * Extract filename from R2/product image URL.
 * e.g. https://pub-xxx.r2.dev/products/product-104-0-xxx.png -> product-104-0-xxx.png
 */
export function extractFilenameFromImageUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const segments = pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && /\.(png|jpg|jpeg|gif|webp|avif)$/i.test(last)) {
      return last;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Normalize image URL to ensure it points to a fetchable R2 path (products/ prefix).
 */
function normalizeImageUrlForFetch(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/^\//, "");
    if (pathname && !pathname.startsWith("products/")) {
      const filename = pathname.split("/").pop() || pathname;
      parsed.pathname = `/products/${filename}`;
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * Remove background from image at URL, resize, return buffer for R2 upload.
 */
export async function removeBackgroundFromImageUrl(imageUrl: string): Promise<{
  filename: string;
  buffer: Buffer;
}> {
  assertAllowedRemoveBackgroundUrl(imageUrl);
  const normalizedUrl = normalizeImageUrlForFetch(imageUrl);
  assertAllowedRemoveBackgroundUrl(normalizedUrl);
  const filename = extractFilenameFromImageUrl(normalizedUrl);
  if (!filename) {
    throw new Error(`Invalid image URL, could not extract filename: ${imageUrl}`);
  }

  const res = await fetch(normalizedUrl, { headers: { "User-Agent": "Turbomeck-RemoveBg/1.0" } });
  if (!res.ok) {
    throw new Error(
      `Kunde inte hämta bilden (HTTP ${res.status}). Kontrollera att URL:en är giltig: ${normalizedUrl}`
    );
  }
  const rawBuffer = Buffer.from(await res.arrayBuffer());
  let pngBuffer: Buffer;
  try {
    pngBuffer = await toPngForBackgroundRemoval(rawBuffer);
  } catch (convErr) {
    const hint =
      convErr instanceof Error && /svg|SVG/i.test(convErr.message)
        ? " (SVG kräver en fristående bildfil; ladda upp PNG/JPEG/WebP/AVIF.)"
        : "";
    throw new Error(
      `Kunde inte läsa bildformatet${hint}${
        convErr instanceof Error ? `: ${convErr.message}` : ""
      }`
    );
  }
  // Buffer/Uint8Array are converted inside imgly to `new Blob([x])` with no type → empty
  // mime → "Unsupported format". Must pass a Blob with an explicit image/* type.
  const inputBlob = new Blob([pngBuffer], { type: "image/png" });
  const blob = await removeBackground(inputBlob, {
    model: "medium",
    output: { format: "image/png", quality: 0.95 },
  });
  const noBgBuffer = Buffer.from(await blob.arrayBuffer());
  const finalBuffer = await encodeProductImageToAvif(noBgBuffer);
  const outputFilename = filename.replace(/\.[^.]+$/, ".avif");

  return { filename: outputFilename, buffer: finalBuffer as Buffer };
}

/**
 * Process product image from URL: fetch, resize, return buffer.
 * Use for reprocessing existing R2 images (e.g. resize only).
 */
export async function processProductImageFromUrl(imageUrl: string): Promise<{
  filename: string;
  buffer: Buffer;
}> {
  const filename = extractFilenameFromImageUrl(imageUrl);
  if (!filename) {
    throw new Error(`Invalid image URL, could not extract filename: ${imageUrl}`);
  }

  const res = await fetch(imageUrl, {
    headers: { "User-Agent": "Turbomeck-Reprocess/1.0" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch image: HTTP ${res.status}`);
  }
  const imageBuffer = Buffer.from(await res.arrayBuffer());
  const finalBuffer = await encodeProductImageToAvif(imageBuffer);
  const outputFilename = filename.replace(/\.[^.]+$/, ".avif");

  return { filename: outputFilename, buffer: finalBuffer as Buffer };
}
