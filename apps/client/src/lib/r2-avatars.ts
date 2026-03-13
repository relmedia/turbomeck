/**
 * Cloudflare R2 upload for user avatars.
 * Uses S3-compatible API. Avatars stored at avatars/avatar-{userId}-{timestamp}.{ext}
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "turbomeck";
const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

const AVATARS_PREFIX = "avatars/";

export function isR2Configured(): boolean {
  return !!(
    R2_ACCOUNT_ID &&
    R2_ACCESS_KEY_ID &&
    R2_SECRET_ACCESS_KEY &&
    R2_PUBLIC_URL
  );
}

function getR2Client(): S3Client {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "R2 storage requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
    );
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Upload avatar buffer to R2 at avatars/avatar-{userId}-{timestamp}.{ext}
 * Returns the full public URL.
 */
export async function uploadAvatarToR2(
  userId: string,
  buffer: Buffer,
  contentType: string,
  ext: string
): Promise<string> {
  const client = getR2Client();
  const filename = `avatar-${userId}-${Date.now()}${ext}`;
  const key = `${AVATARS_PREFIX}${filename}`;

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const base = (R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!base) {
    throw new Error("R2_PUBLIC_URL or NEXT_PUBLIC_R2_PUBLIC_URL is required");
  }
  return `${base}/${key}`;
}
