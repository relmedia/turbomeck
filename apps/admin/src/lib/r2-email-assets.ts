/**
 * Moves images a design loads from a third party onto our own R2.
 *
 * The editor uploads anything dragged into it to `assets.unlayer.com`, and
 * the stored design then points there. That puts a CDN nobody here controls
 * in front of transactional mail: if those files are pruned, every customer
 * gets broken images in an order confirmation.
 *
 * Two kinds of image turn up, and they are handled differently:
 *
 *  - **The logo** is recognised by its filename and rewritten to the single
 *    canonical `EMAIL_LOGO_URL`, so the designed templates and the compiled
 *    ones show the same picture rather than four separate uploads of it.
 *  - **Everything else** is content the shop chose — `thankyou.jpg`,
 *    `posten.jpg` — and is copied byte-for-byte to our bucket and repointed.
 *    These must never be replaced by the logo; they are the picture someone
 *    deliberately put there.
 *
 * Idempotent: a URL already on our own host is left alone, so this can run
 * repeatedly.
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const ASSETS_PREFIX = "email-assets/";
const MAX_BYTES = 5 * 1024 * 1024;

/** Hosts whose images we want to stop depending on. */
const FOREIGN_HOSTS = ["assets.unlayer.com", "cdn.unlayer.com"];

export function isAssetMirrorConfigured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      (process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL),
  );
}

export function isForeignImage(url: string): boolean {
  try {
    return FOREIGN_HOSTS.includes(new URL(url).host.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Whether a URL is the shop's logo.
 *
 * By filename, because that is the only signal available: the editor renames
 * nothing, so an image dragged in as `turbologo.png` keeps that name. Content
 * images in these templates are `thankyou.jpg`, `takk.jpg`, `posten.jpg` and
 * `levererad.jpg` — none of which match, which is exactly the distinction
 * that must hold.
 */
export function looksLikeLogo(url: string): boolean {
  try {
    return /logo|logga/i.test(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    return false;
  }
}

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

/** Copy one remote image to R2 and return its new public URL. */
export async function mirrorImageToR2(sourceUrl: string): Promise<string> {
  const publicBase = (process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!publicBase) throw new Error("R2_PUBLIC_URL saknas");

  const res = await fetch(sourceUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`kunde inte hämta bilden (HTTP ${res.status})`);

  const contentType = res.headers.get("content-type") ?? "image/png";
  if (!contentType.startsWith("image/")) throw new Error(`inte en bild (${contentType})`);

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0) throw new Error("tom bild");
  if (bytes.length > MAX_BYTES) throw new Error(`bilden är för stor (${bytes.length} byte)`);

  /**
   * The original filename is kept so the bucket stays readable, prefixed with
   * a short hash of the source so two different `logo.png` uploads cannot
   * collide. Deterministic, which is what makes re-running a no-op rather
   * than a pile of duplicates.
   */
  const name = (new URL(sourceUrl).pathname.split("/").pop() ?? "image")
    .toLowerCase()
    .replace(/[^a-z0-9.\-]+/g, "-")
    .slice(-60);
  let hash = 0;
  for (let i = 0; i < sourceUrl.length; i++) hash = (hash * 31 + sourceUrl.charCodeAt(i)) >>> 0;
  const key = `${ASSETS_PREFIX}${hash.toString(36)}-${name}`;

  await client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || "turbomeck",
      Key: key,
      Body: bytes,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return `${publicBase}/${key}`;
}

type Content = { type?: string; values?: { src?: { url?: string } } };
type DesignShape = { body?: { rows?: Array<{ columns?: Array<{ contents?: Content[] }> }> } };

export type MirrorReport = {
  design: Record<string, unknown>;
  movedToLogo: number;
  mirrored: number;
  failures: string[];
};

/**
 * Rewrite every third-party image in a design.
 *
 * Mutates the design it is given, which is fine because callers pass a copy
 * parsed from the API response.
 */
export async function mirrorDesignImages(
  design: Record<string, unknown>,
  logoUrl: string,
): Promise<MirrorReport> {
  const shape = design as DesignShape;
  const report: MirrorReport = { design, movedToLogo: 0, mirrored: 0, failures: [] };

  for (const row of shape.body?.rows ?? []) {
    for (const column of row.columns ?? []) {
      for (const content of column.contents ?? []) {
        if (content?.type !== "image") continue;
        const url = content.values?.src?.url;
        if (!url || !isForeignImage(url)) continue;

        if (looksLikeLogo(url)) {
          content.values!.src!.url = logoUrl;
          report.movedToLogo++;
          continue;
        }

        try {
          content.values!.src!.url = await mirrorImageToR2(url);
          report.mirrored++;
        } catch (err) {
          /**
           * Left pointing at the original on failure rather than blanked: a
           * working third-party image beats a broken own-host one, and the
           * failure is reported so it can be retried.
           */
          report.failures.push(
            `${url.split("/").pop()}: ${err instanceof Error ? err.message : "fel"}`,
          );
        }
      }
    }
  }

  return report;
}
