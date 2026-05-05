/**
 * Repair script for `order_items.product_image`.
 *
 * Background:
 *   `order_items.product_image` is a *snapshot* of the product image URL at the
 *   moment the order was placed. After we migrated images to Cloudflare R2,
 *   older snapshots still point to absolute URLs like
 *     http://localhost:3001/uploads/product-...png
 *   or to bare paths like
 *     /uploads/product-...png
 *   These render as 404 in the admin /payments table.
 *
 * Strategy:
 *   For every order_items row whose product_image is empty, points at a local
 *   /uploads/* path, points at localhost:3001/3002, or otherwise looks stale,
 *   refresh it from the live `products.image` for the same product_id.
 *
 *   If the product has been deleted (no row), leave the snapshot alone — the
 *   admin UI should fall back gracefully (and we don't want to lose history).
 *
 * Usage (from repo root):
 *   pnpm --filter product-service refresh-order-item-images          # dry run
 *   pnpm --filter product-service refresh-order-item-images -- --apply
 */

import { db } from "@repo/database";
import { orderItems, products } from "@repo/database/schema";
import { eq } from "drizzle-orm";

const apply = process.argv.includes("--apply");

function isStaleSnapshot(url: string | null | undefined): boolean {
  if (!url) return true;
  const u = url.trim();
  if (!u) return true;
  if (u.startsWith("/uploads/")) return true;
  if (u.startsWith("uploads/")) return true;
  if (u.includes("localhost:3001/uploads/")) return true;
  if (u.includes("localhost:3002/uploads/")) return true;
  if (u.includes("127.0.0.1:3001/uploads/")) return true;
  if (u.includes("127.0.0.1:3002/uploads/")) return true;
  return false;
}

async function main() {
  const all = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      productId: orderItems.productId,
      productName: orderItems.productName,
      productImage: orderItems.productImage,
    })
    .from(orderItems);

  console.log(`Scanned ${all.length} order_items row(s).`);

  let stale = 0;
  let updated = 0;
  let skippedNoProduct = 0;
  let skippedNoLiveImage = 0;
  const todo: Array<{
    id: number;
    productId: number;
    from: string | null;
    to: string;
  }> = [];

  for (const row of all) {
    if (!isStaleSnapshot(row.productImage)) continue;
    stale++;

    if (row.productId == null) {
      skippedNoProduct++;
      console.log(
        `  - id=${row.id} product_id=NULL (${row.productName}) → no product link, skipping`,
      );
      continue;
    }

    const [prod] = await db
      .select({ image: products.image })
      .from(products)
      .where(eq(products.id, row.productId))
      .limit(1);

    if (!prod) {
      skippedNoProduct++;
      console.log(
        `  - id=${row.id} product_id=${row.productId} (${row.productName}) → product missing, skipping`,
      );
      continue;
    }
    if (!prod.image) {
      skippedNoLiveImage++;
      console.log(
        `  - id=${row.id} product_id=${row.productId} (${row.productName}) → product has no current image, skipping`,
      );
      continue;
    }
    if (prod.image === row.productImage) continue;

    todo.push({
      id: row.id,
      productId: row.productId,
      from: row.productImage,
      to: prod.image,
    });
  }

  if (todo.length === 0) {
    console.log("\nNothing to update.");
    console.log(
      `Stale rows: ${stale}, skipped (no product): ${skippedNoProduct}, skipped (no live image): ${skippedNoLiveImage}`,
    );
    process.exit(0);
  }

  console.log(`\nWill update ${todo.length} row(s):`);
  for (const t of todo) {
    console.log(
      `  id=${t.id} product_id=${t.productId}\n    from: ${t.from ?? "(null)"}\n    to:   ${t.to}`,
    );
  }

  if (!apply) {
    console.log("\nDry run. Re-run with `-- --apply` to write changes.");
    process.exit(0);
  }

  for (const t of todo) {
    await db
      .update(orderItems)
      .set({ productImage: t.to })
      .where(eq(orderItems.id, t.id));
    updated++;
  }

  console.log(`\nUpdated ${updated} row(s).`);
  console.log(
    `Skipped: ${skippedNoProduct} (no product), ${skippedNoLiveImage} (no live image).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
