/**
 * Delete all product images from the R2 bucket (products/ prefix).
 *
 * Usage (from repo root):
 *   pnpm delete-r2-images
 */

import { isR2Configured, deleteAllFromR2 } from "../src/r2-storage.js";

async function main() {
  if (!isR2Configured()) {
    console.error("R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.");
    process.exit(1);
  }

  console.log("Deleting all images from R2 bucket (products/)...");
  const deleted = await deleteAllFromR2();
  console.log(`Done. Deleted ${deleted} objects.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
