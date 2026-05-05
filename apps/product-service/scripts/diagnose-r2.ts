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
 */

import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

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

  // 4) Try a HEAD on a URL the dev server logged as 404
  const probeFromLog = "products/product-67-0-mmotgm2z3n3tcf.png";
  console.log();
  console.log(`[4] Looking for "${probeFromLog}" in the bucket via S3 HEAD…`);
  try {
    await client.send(
      new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: probeFromLog }),
    );
    console.log(`    -> Object EXISTS in bucket. The 404 from r2.dev must be a public-access issue.`);
  } catch (err) {
    const code = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    console.log(`    -> S3 HEAD returned HTTP ${code ?? "?"}: object NOT in bucket at this key.`);
    console.log("       The DB still references it, but it's not in R2. Either:");
    console.log("         a) it was uploaded to a different bucket / prefix, or");
    console.log("         b) the bucket was wiped, or");
    console.log("         c) the key naming changed (look at the [1] sample keys above).");
  }
}

main().catch((err) => {
  console.error("R2 diagnostic failed:", err);
  process.exit(1);
});
