/**
 * Migrate product images from turbomeck.se to R2.
 *
 * 1. Fetches products from WooCommerce (turbomeck.se) or DB
 * 2. Fetches all images from source URLs (BEFORE deleting R2 - images may be in R2)
 * 3. Deletes ALL images from R2 bucket (products/ prefix)
 * 4. Uploads images to R2 and updates each product in DB
 *
 * Usage (from repo root):
 *   pnpm migrate-images
 *
 * Env:
 *   MIGRATE_WOOCOMMERCE_URL - WooCommerce Store API (default: https://turbomeck.se/wp-json/wc/store/v1/products)
 *   MIGRATE_FROM_API       - "false" to use DB only; otherwise fetches from WooCommerce
 *   R2_*                   - Must be set for R2 upload
 *   DATABASE_URL           - Must be set for DB updates
 */

import { db } from "@repo/database";
import { products } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { isR2Configured, uploadToR2, deleteAllFromR2 } from "../src/r2-storage.js";

const WOOCOMMERCE_API =
  process.env.MIGRATE_WOOCOMMERCE_URL ||
  "https://turbomeck.se/wp-json/wc/store/v1/products";

function toFetchUrl(path: string | null): string | null {
  if (!path || !path.trim()) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return path;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Turbomeck-Migration/1.0" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function resizeToSquare(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(buffer)
    .resize(1200, 1200, { fit: "inside" })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

function uniqueFilename(productId: number, index: number): string {
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return `product-${productId}-${index}-${suffix}.png`;
}

type ProductEntry = {
  id: number;
  name: string | null;
  image: string | null;
  thumbnails: string[];
};

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\u201c\u201d\u2018\u2019\u2033\u2032""'']/g, "") // quotes, primes
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+/g, " ")
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^\w\s-]/g, " ") // normalize punctuation
    .replace(/\s+/g, " ")
    .trim();
}

type WooProduct = {
  id: number;
  name: string;
  images?: Array<{ src: string }>;
};

async function getProducts(): Promise<ProductEntry[]> {
  const fromWoo = process.env.MIGRATE_FROM_API !== "false";
  if (fromWoo) {
    console.log(`Fetching products from WooCommerce: ${WOOCOMMERCE_API}`);
    const baseUrl = WOOCOMMERCE_API.replace(/\?.*$/, "");
    const sep = baseUrl.includes("?") ? "&" : "?";
    const wcProducts: WooProduct[] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const url = `${baseUrl}${sep}per_page=100&page=${page}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      const batch = (await res.json()) as WooProduct[];
      wcProducts.push(...batch);
      hasMore = batch.length === 100;
      page++;
      if (batch.length > 0) process.stdout.write(`  Fetched page ${page - 1}: ${batch.length} products\n`);
    }
    console.log(`  Total: ${wcProducts.length} WooCommerce products`);

    console.log("Fetching our products from DB to match by name...");
    const dbRows = await db.select({
      id: products.id,
      name: products.name,
    }).from(products);
    const dbByName = new Map<string, { id: number; name: string }>();
    for (const p of dbRows) {
      const n = normalizeName(p.name ?? "");
      if (n) dbByName.set(n, { id: p.id, name: p.name ?? "" });
    }

    const matched: ProductEntry[] = [];
    for (const wc of wcProducts) {
      const images = Array.isArray(wc.images) ? wc.images : [];
      const imageUrls = images.map((i) => i.src).filter(Boolean);
      if (imageUrls.length === 0) continue;

      const wcName = (wc.name ?? "").trim();
      const norm = normalizeName(wcName);
      const dbProduct = dbByName.get(norm);
      if (!dbProduct) {
        console.warn(`  No DB match for WC product "${wcName}" (id ${wc.id}), skipping`);
        continue;
      }

      matched.push({
        id: dbProduct.id,
        name: dbProduct.name,
        image: imageUrls[0] ?? null,
        thumbnails: imageUrls.slice(1),
      });
    }
    console.log(`Matched ${matched.length} products (WC has ${wcProducts.length} total)`);
    return matched;
  }

  console.log("Fetching products from DB...");
  const rows = await db.select({
    id: products.id,
    name: products.name,
    image: products.image,
    thumbnails: products.thumbnails,
  }).from(products);
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    image: p.image,
    thumbnails: ((p as { thumbnails?: string[] }).thumbnails ?? []),
  }));
}

async function main() {
  if (!isR2Configured()) {
    console.error("R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL");
    process.exit(1);
  }

  const allProducts = await getProducts();

  const withImages = allProducts.filter((p) => {
    const img = p.image;
    const thumbs = p.thumbnails ?? [];
    return (img && img.trim()) || thumbs.some((t) => t && t.trim());
  });

  if (withImages.length === 0) {
    console.log("No products with images found.");
    return;
  }

  console.log(`Found ${withImages.length} products with images.`);

  // IMPORTANT: Fetch all images FIRST (they may currently be in R2), then delete, then upload
  console.log("\nStep 1: Fetching all images from source (before deleting R2)...");
  type ProductWithBuffers = typeof withImages[0] & {
    mainBuffer?: Buffer;
    thumbBuffers: Buffer[];
  };
  const fetched: ProductWithBuffers[] = [];

  for (let i = 0; i < withImages.length; i++) {
    const product = withImages[i];
    const name = product.name ?? `#${product.id}`;
    const thumbs = product.thumbnails ?? [];
    const mainUrl = toFetchUrl(product.image ?? null);
    const thumbUrls = thumbs.map((t) => toFetchUrl(t)).filter((u): u is string => !!u);
    const allUrls = mainUrl ? [mainUrl, ...thumbUrls] : thumbUrls;

    process.stdout.write(`[${i + 1}/${withImages.length}] Fetch ${name} ... `);
    const entry: ProductWithBuffers = { ...product, thumbBuffers: [] };
    let hasError = false;

    for (let j = 0; j < allUrls.length; j++) {
      try {
        const buffer = await fetchImageBuffer(allUrls[j]);
        if (j === 0) entry.mainBuffer = buffer;
        else entry.thumbBuffers.push(buffer);
      } catch (err) {
        console.warn(`\n  Failed to fetch image ${j}: ${err}`);
        hasError = true;
      }
    }

    if (!hasError || entry.mainBuffer || entry.thumbBuffers.length > 0) {
      fetched.push(entry);
      console.log("OK");
    } else {
      console.log("SKIP");
    }
  }

  if (fetched.length === 0) {
    console.log("\nNo images could be fetched. Aborting.");
    process.exit(1);
  }

  console.log(`\nStep 2: Deleting all images from R2 bucket...`);
  const deleted = await deleteAllFromR2();
  console.log(`Deleted ${deleted} objects.\n`);

  console.log("Step 3: Uploading to R2 and updating products...\n");

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < fetched.length; i++) {
    const product = fetched[i];
    const name = product.name ?? `#${product.id}`;
    const allBuffers = [
      ...(product.mainBuffer ? [product.mainBuffer] : []),
      ...product.thumbBuffers,
    ];

    process.stdout.write(`[${i + 1}/${fetched.length}] ${name} ... `);

    const newUrls: string[] = [];
    let hasError = false;

    for (let j = 0; j < allBuffers.length; j++) {
      try {
        const resized = await resizeToSquare(allBuffers[j]);
        const filename = uniqueFilename(product.id, j);
        const r2Url = await uploadToR2(filename, resized, "image/png");
        newUrls.push(r2Url);
      } catch (err) {
        console.warn(`\n  Failed to upload image ${j}: ${err}`);
        hasError = true;
      }
    }

    if (hasError && newUrls.length === 0) {
      console.log("SKIP");
      fail++;
      continue;
    }

    const newMain = newUrls[0] ?? null;
    const newThumbs = newUrls.slice(1);

    try {
      await db
        .update(products)
        .set({
          image: newMain,
          thumbnails: newThumbs,
          updatedAt: new Date(),
        })
        .where(eq(products.id, product.id));
      console.log("OK");
      ok++;
    } catch (err) {
      console.log("DB UPDATE FAIL");
      console.warn("  ", err);
      fail++;
    }
  }

  console.log(`\nDone. OK: ${ok}, Failed: ${fail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
