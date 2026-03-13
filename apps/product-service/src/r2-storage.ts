/**
 * Cloudflare R2 object storage for product images.
 * Uses S3-compatible API. Objects are stored at products/{filename}.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "turbomeck";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // e.g. https://pub-xxx.r2.dev or https://images.yoursite.com

const PRODUCTS_PREFIX = "products/";
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

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

export function isR2Configured(): boolean {
  return !!(
    R2_ACCOUNT_ID &&
    R2_ACCESS_KEY_ID &&
    R2_SECRET_ACCESS_KEY &&
    R2_PUBLIC_URL
  );
}

/**
 * Upload a file buffer to R2 at products/{filename}.
 * Returns the full public URL.
 */
export async function uploadToR2(
  filename: string,
  buffer: Buffer,
  contentType: string = "image/png"
): Promise<string> {
  const client = getR2Client();
  const key = `${PRODUCTS_PREFIX}${filename}`;

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  if (!R2_PUBLIC_URL) {
    throw new Error("R2_PUBLIC_URL is required for public image URLs");
  }

  const base = R2_PUBLIC_URL.replace(/\/$/, "");
  return `${base}/${key}`;
}

/**
 * Delete ALL objects in the products/ prefix from R2. Use with caution.
 */
export async function deleteAllFromR2(): Promise<number> {
  const client = getR2Client();
  let totalDeleted = 0;
  let continuationToken: string | undefined;

  do {
    const listResult = await client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: PRODUCTS_PREFIX,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      })
    );

    const keys = (listResult.Contents || [])
      .map((o) => o.Key)
      .filter((k): k is string => !!k);

    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: R2_BUCKET_NAME,
          Delete: {
            Objects: keys.map((Key) => ({ Key })),
            Quiet: true,
          },
        })
      );
      totalDeleted += keys.length;
      console.log(`  Deleted ${keys.length} objects (total: ${totalDeleted})`);
    }

    continuationToken = listResult.NextContinuationToken;
  } while (continuationToken);

  return totalDeleted;
}

/**
 * Delete an object from R2 by key.
 * Key can be full URL or just filename (e.g. products/xxx.png or xxx.png).
 */
export async function deleteFromR2(keyOrUrl: string): Promise<void> {
  const client = getR2Client();
  let key = keyOrUrl;

  if (key.startsWith("http")) {
    try {
      const url = new URL(key);
      key = url.pathname.replace(/^\//, "");
    } catch {
      return;
    }
  }
  if (!key.startsWith(PRODUCTS_PREFIX)) {
    key = `${PRODUCTS_PREFIX}${key.replace(/^.*[/\\]/, "")}`;
  }

  await client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );
}

function isImageKey(key: string): boolean {
  const ext = key.toLowerCase().slice(key.lastIndexOf("."));
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * List all image objects in the bucket (products/ prefix and root).
 * Returns public URLs for each object. Paginates through all results.
 */
export async function listR2Products(): Promise<string[]> {
  const client = getR2Client();
  const objects: string[] = [];
  const base = (R2_PUBLIC_URL || "").replace(/\/$/, "");
  const prefixes = [PRODUCTS_PREFIX, ""] as const;
  const seen = new Set<string>();

  for (const prefix of prefixes) {
    let continuationToken: string | undefined;
    do {
      const params: {
        Bucket: string;
        Prefix?: string;
        MaxKeys: number;
        ContinuationToken?: string;
      } = {
        Bucket: R2_BUCKET_NAME,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      };
      if (prefix) params.Prefix = prefix;

      const result = await client.send(new ListObjectsV2Command(params));

      for (const obj of result.Contents || []) {
        if (obj.Key && isImageKey(obj.Key) && !seen.has(obj.Key)) {
          seen.add(obj.Key);
          objects.push(base ? `${base}/${obj.Key}` : obj.Key);
        }
      }
      continuationToken = result.NextContinuationToken;
    } while (continuationToken);
  }

  const sorted = objects.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return [...new Set(sorted)];
}
