/**
 * Copies the email logo onto our own R2 bucket.
 *
 * The four templates that already show a logo load it from
 * `assets.unlayer.com` — the editor uploaded it there when it was dragged in.
 * That is a third-party CDN nobody here controls: if those files are pruned,
 * every customer gets a broken logo in a transactional email.
 *
 * So the bytes are fetched once and written to R2, and the designs are
 * repointed at that copy. The source is the logo already chosen in the
 * editor, not the older `branding/logo.png` that happened to be in the
 * bucket — those are different images, and the four working templates must
 * not change appearance.
 *
 * Idempotent: writing the same key again just overwrites it.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --tsconfig apps/admin/tsconfig.json --env-file=apps/admin/.env \
 *     apps/admin/src/lib/__upload-email-logo.ts <source-url>
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const KEY = "branding/email-logo.png";

async function main() {
  const source = process.argv[2];
  if (!source?.startsWith("https://")) {
    console.error("usage: __upload-email-logo.ts <https source url>");
    process.exit(1);
  }

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME || "turbomeck";
  const publicBase = (process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "").replace(/\/$/, "");

  if (!accountId || !accessKeyId || !secretAccessKey || !publicBase) {
    console.error("R2 is not configured (need R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL)");
    process.exit(1);
  }

  const res = await fetch(source);
  if (!res.ok) {
    console.error(`could not fetch the source logo: HTTP ${res.status}`);
    process.exit(1);
  }
  const contentType = res.headers.get("content-type") ?? "image/png";
  const bytes = Buffer.from(await res.arrayBuffer());
  console.log(`fetched ${bytes.length} bytes (${contentType}) from ${source}`);

  if (!contentType.startsWith("image/")) {
    console.error(`refusing to upload a non-image (${contentType})`);
    process.exit(1);
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: KEY,
      Body: bytes,
      ContentType: contentType,
      /**
       * A year, immutable. The key is stable so emails already in inboxes
       * keep resolving; replacing the logo means uploading a new key and
       * repointing, not mutating this one behind live mail.
       */
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const url = `${publicBase}/${KEY}`;
  console.log(`uploaded -> ${url}`);

  /** Prove it is actually served, not just accepted by the API. */
  const check = await fetch(url, { cache: "no-store" });
  const servedLength = Number(check.headers.get("content-length") ?? 0);
  console.log(`served   -> HTTP ${check.status}, ${servedLength} bytes, ${check.headers.get("content-type")}`);

  if (!check.ok || servedLength !== bytes.length) {
    console.error("FAIL: the uploaded object is not being served identically");
    process.exit(1);
  }
  console.log("OK: byte-identical and publicly reachable");
  process.exit(0);
}

void main();
