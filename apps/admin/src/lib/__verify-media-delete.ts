/**
 * Checks deletion really deletes the object asked for, and only that one.
 *
 * The specific hazard: `deleteFromR2` forces the `products/` prefix onto any
 * key without one. Handed `email-assets/takk.jpg` it aims at
 * `products/takk.jpg` — a different object, and one that might belong to a
 * product. A media library spans every folder, so it must not inherit that.
 *
 * Proving it needs a real round trip, because the bug is in how a key is
 * resolved against a live bucket; a mock would only test the mock. So this
 * uploads throwaway objects into two folders, deletes one by its full key,
 * and confirms the other is untouched.
 *
 * Creates and removes only its own objects, under a `__verify-delete/` prefix
 * nothing else uses.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --tsconfig apps/admin/tsconfig.json --env-file=apps/admin/.env \
 *     apps/admin/src/lib/__verify-media-delete.ts
 */

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

const BUCKET = process.env.R2_BUCKET_NAME || "turbomeck";
const PREFIX = "__verify-delete/";

/** A one-pixel PNG, so nothing large is written. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID!;
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

async function exists(c: S3Client, key: string): Promise<boolean> {
  try {
    await c.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** The exact-key delete the media route uses, reproduced. */
async function deleteExact(c: S3Client, key: string): Promise<void> {
  const clean = (key.split("?")[0] ?? "").trim().replace(/^\/+/, "").trim();
  if (!clean) throw new Error("Tom nyckel");
  await c.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: clean }));
}

/** The OLD behaviour, to show what it would have done. */
function legacyKeyFor(keyOrUrl: string): string {
  let key = keyOrUrl;
  if (!key.startsWith("products/")) {
    key = `products/${key.replace(/^.*[/\\]/, "")}`;
  }
  return key;
}

async function main() {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID) {
    console.error("R2 is not configured");
    process.exit(1);
  }
  const c = client();

  /**
   * Two objects sharing a filename in different folders — the exact shape
   * the prefix-forcing bug confuses.
   */
  const target = `${PREFIX}email-assets/shared-name.png`;
  const bystander = `${PREFIX}products/shared-name.png`;

  await c.send(new PutObjectCommand({ Bucket: BUCKET, Key: target, Body: PIXEL, ContentType: "image/png" }));
  await c.send(new PutObjectCommand({ Bucket: BUCKET, Key: bystander, Body: PIXEL, ContentType: "image/png" }));

  check("both probe objects exist", (await exists(c, target)) && (await exists(c, bystander)));

  /** What the old resolution would have aimed at. */
  const legacy = legacyKeyFor(target);
  check(
    "the legacy rule would have targeted a different object",
    legacy !== target,
    { asked: target, legacyWouldDelete: legacy },
  );

  await deleteExact(c, target);

  check("the object asked for is gone", !(await exists(c, target)));
  check("the one sharing its filename is untouched", await exists(c, bystander), bystander);

  /* ---- key hygiene ------------------------------------------------------ */
  {
    const q = `${PREFIX}products/with-query.png`;
    await c.send(new PutObjectCommand({ Bucket: BUCKET, Key: q, Body: PIXEL, ContentType: "image/png" }));
    /** A cache-busted key must still resolve to the object. */
    await deleteExact(c, `${q}?v=12345`);
    check("a cache-buster is stripped before deleting", !(await exists(c, q)));

    const slashed = `${PREFIX}products/leading-slash.png`;
    await c.send(new PutObjectCommand({ Bucket: BUCKET, Key: slashed, Body: PIXEL, ContentType: "image/png" }));
    await deleteExact(c, `/${slashed}`);
    check("a leading slash is stripped", !(await exists(c, slashed)));

    let threw = false;
    try {
      await deleteExact(c, "   ");
    } catch {
      threw = true;
    }
    check("an empty key is refused rather than guessed at", threw);
  }

  /* ---- clean up ---------------------------------------------------------- */
  await deleteExact(c, bystander);
  check("probe objects cleaned up", !(await exists(c, bystander)));

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
