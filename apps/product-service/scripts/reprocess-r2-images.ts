/**
 * Re-encode all R2 product images as AVIF (resize + migrate URLs in DB).
 * Same pipeline as migrate-products-to-avif with --force so existing AVIF files are reprocessed too.
 *
 * Run: pnpm --filter product-service reprocess-r2-images
 * Optional: --delete-old (pass through to migration)
 */

import { migrateProductImagesToAvif } from "./migrate-products-to-avif.js";

const deleteOld = process.argv.includes("--delete-old");

migrateProductImagesToAvif({ force: true, deleteOld }).catch((err) => {
  console.error(err);
  process.exit(1);
});
