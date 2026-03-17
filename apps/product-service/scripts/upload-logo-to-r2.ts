/**
 * Upload logo.png to Cloudflare R2 at branding/logo.png.
 * Run: pnpm --filter product-service upload-logo
 *
 * Uses logo from apps/client/public/logo.png.
 * The email template will use R2_PUBLIC_URL/branding/logo.png.
 */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "turbomeck";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

const KEY = "branding/logo.png";

async function main() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error("Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env");
    process.exit(1);
  }
  if (!R2_PUBLIC_URL) {
    console.error("Set R2_PUBLIC_URL in .env");
    process.exit(1);
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const logoPath = join(__dirname, "../../client/public/logo.png");

  let buffer: Buffer;
  try {
    buffer = await readFile(logoPath);
  } catch (err) {
    console.error("Could not read logo.png at:", logoPath);
    console.error(err);
    process.exit(1);
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: KEY,
      Body: buffer,
      ContentType: "image/png",
    })
  );

  const url = `${R2_PUBLIC_URL!.replace(/\/$/, "")}/${KEY}`;
  console.log("Logo uploaded successfully.");
  console.log("URL:", url);
  console.log("\nUse this URL in your email template. Set EMAIL_LOGO_URL or ensure R2_PUBLIC_URL is set in the client.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
