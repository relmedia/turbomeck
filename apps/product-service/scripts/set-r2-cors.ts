/**
 * Set CORS policy on the R2 bucket so browsers can access bucket contents.
 * Run: pnpm --filter product-service set-r2-cors
 *
 * Add your production domain to R2_CORS_ORIGINS (comma-separated) to allow it.
 * Example: R2_CORS_ORIGINS=https://yoursite.com,https://admin.yoursite.com
 */

import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "turbomeck";
const R2_CORS_ORIGINS = process.env.R2_CORS_ORIGINS || "";

const baseOrigins = [
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3002",
  "http://127.0.0.1:3000",
];

const extraOrigins = R2_CORS_ORIGINS
  ? R2_CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

const allowedOrigins = [...new Set([...baseOrigins, ...extraOrigins])];

async function main() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error("Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env");
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

  const cors = {
    CORSRules: [
      {
        AllowedOrigins: allowedOrigins,
        AllowedMethods: ["GET", "HEAD"],
        AllowedHeaders: ["*"],
        MaxAgeSeconds: 3600,
      },
    ],
  };

  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: R2_BUCKET_NAME,
        CORSConfiguration: cors,
      })
    );
    console.log("CORS policy applied to bucket:", R2_BUCKET_NAME);
    console.log("Allowed origins:", allowedOrigins.join(", "));
  } catch (err) {
    console.error("Failed to set CORS:", err);
    process.exit(1);
  }
}

main();
