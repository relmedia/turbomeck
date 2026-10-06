/**
 * Diagnose R2 connectivity + public access.
 *
 * Run from repo root or product-service:
 *   pnpm --filter product-service diagnose-r2
 *
 * Checks:
 *   1) S3 ListObjects works with the configured creds (counts + first 10 keys)
 *   2) For each of the first few keys, fetches the public URL and prints status
 *   3) Verifies that DB image_url paths still match objects in the bucket
 *   4) Audits every product image reference; --clear-missing nulls dead ones
 */

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "turbomeck";
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

const PRODUCTS_PREFIX = "products/";

function bail(msg: string): never {
  console.error("✗ " + msg);
  process.exit(1);
}

async function main() {
  console.log("R2 diagnostics");
  console.log("==============");
  console.log("  Account ID :", R2_ACCOUNT_ID ? `${R2_ACCOUNT_ID.slice(0, 8)}…` : "(missing)");
  console.log("  Bucket     :", R2_BUCKET_NAME);
  console.log("  Public URL :", R2_PUBLIC_URL || "(missing)");
  console.log();

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    bail("Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env");
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  // 1) ListObjects under products/
  console.log(`[1] Listing ${R2_BUCKET_NAME}/${PRODUCTS_PREFIX} (first 1000)…`);
  const list = await client.send(
    new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: PRODUCTS_PREFIX,
      MaxKeys: 1000,
    }),
  );
  const keys = (list.Contents || []).map((o) => o.Key).filter((k): k is string => !!k);
  console.log(`    -> ${keys.length} object(s) under "${PRODUCTS_PREFIX}".`);
  if (keys.length === 0) {
    console.log("    (Bucket is empty under products/. Either uploads aren't going here,");
    console.log("     or the data was deleted. Check Cloudflare Dashboard → R2 → bucket Objects.)");
  } else {
    console.log("    First 10 keys:");
    for (const k of keys.slice(0, 10)) console.log("      -", k);
  }

  // 2) Total bucket size + a peek at root (uploads with no prefix)
  console.log();
  console.log(`[2] Listing ${R2_BUCKET_NAME}/ (root, first 1000)…`);
  const rootList = await client.send(
    new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, MaxKeys: 1000 }),
  );
  const allKeys = (rootList.Contents || []).map((o) => o.Key).filter((k): k is string => !!k);
  console.log(`    -> ${allKeys.length} object(s) total.`);
  const otherPrefixes = new Set(
    allKeys.map((k) => (k.includes("/") ? k.split("/")[0] + "/" : "(root)")),
  );
  console.log("    Top-level prefixes:", [...otherPrefixes].join(", ") || "(none)");

  // 3) Try fetching first key via public URL
  if (keys[0] && R2_PUBLIC_URL) {
    const sampleKey = keys[0];
    const sampleUrl = `${R2_PUBLIC_URL}/${sampleKey}`;
    console.log();
    console.log(`[3] Fetching public URL of a real object: ${sampleUrl}`);
    try {
      const res = await fetch(sampleUrl, { method: "HEAD" });
      console.log(`    -> HTTP ${res.status} ${res.statusText}`);
      const ct = res.headers.get("content-type") || "";
      const cl = res.headers.get("content-length") || "";
      console.log(`    -> content-type: ${ct} | content-length: ${cl}`);
      if (res.status === 404) {
        console.log("    Object IS in bucket (S3 list returned it) but public URL says 404.");
        console.log("    => The bucket's R2.dev public access is DISABLED or under a different");
        console.log("       hash. Open Cloudflare Dashboard → R2 → bucket → Settings →");
        console.log("       'R2.dev subdomain' → Allow Access. Make sure the URL there matches");
        console.log("       NEXT_PUBLIC_R2_PUBLIC_URL / R2_PUBLIC_URL in your envs.");
      } else if (res.status === 403) {
        console.log("    => Bucket public access is gated. Allow public access (R2.dev subdomain)");
        console.log("       or attach a custom domain that's published.");
      } else if (res.status === 200) {
        console.log("    => Public access works for this object.");
      }
    } catch (err) {
      console.log("    -> fetch failed:", (err as Error).message);
    }
  }

  // 4) Audit every product image reference against the bucket.
  //
  // This used to HEAD one key pasted from a log, which answered the question
  // once and never again. Listing the bucket and diffing it against the DB
  // answers it for every product, every time.
  console.log();
  console.log("[4] Auditing product image references against the bucket…");

  const { db } = await import("@repo/database");
  const { products } = await import("@repo/database/schema");
  const { isNotNull, eq } = await import("drizzle-orm");

  const bucketKeys = new Set<string>();
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: PRODUCTS_PREFIX,
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents ?? []) if (obj.Key) bucketKeys.add(obj.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  console.log(`    bucket holds ${bucketKeys.size} object(s) under ${PRODUCTS_PREFIX}`);

  const rows = await db
    .select({ id: products.id, name: products.name, image: products.image })
    .from(products)
    .where(isNotNull(products.image));

  /** Strip the origin and any ?v= cache-buster to get the bucket key. */
  const keyOf = (url: string): string | null => {
    const withoutQuery = url.split("?")[0] ?? "";
    const idx = withoutQuery.indexOf(`/${PRODUCTS_PREFIX}`);
    if (idx === -1) return null;
    return withoutQuery.slice(idx + 1);
  };

  const broken: Array<{ id: number; name: string; key: string }> = [];
  for (const row of rows) {
    const key = keyOf(row.image ?? "");
    if (!key) continue;
    if (!bucketKeys.has(key)) {
      broken.push({ id: row.id, name: row.name ?? "", key });
    }
  }

  if (broken.length === 0) {
    console.log("    every product image resolves to an object in the bucket.");
  } else {
    console.log(`    ${broken.length} product(s) reference an object that is NOT in the bucket:`);
    for (const b of broken) {
      console.log(`      #${b.id}  ${b.name.slice(0, 40).padEnd(40)} ${b.key}`);
    }
    console.log();
    console.log("    These render as a broken image and make next/image log an upstream 404.");
    console.log("    The file itself is gone, so re-upload the image in admin — or run");
    console.log("    this script with --clear-missing to null the dead references so the");
    console.log("    storefront falls back to its placeholder instead.");

    if (process.argv.includes("--clear-missing")) {
      for (const b of broken) {
        await db.update(products).set({ image: null }).where(eq(products.id, b.id));
        console.log(`      cleared image on #${b.id}`);
      }
      console.log(`    cleared ${broken.length} dead reference(s).`);
    }
  }
}

main().catch((err) => {
  console.error("R2 diagnostic failed:", err);
  process.exit(1);
});
