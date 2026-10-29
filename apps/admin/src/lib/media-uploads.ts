import { db } from "@repo/database";
import { mediaUploads } from "@repo/database/schema";
import { sql } from "drizzle-orm";

/**
 * Records who uploaded an image.
 *
 * Called from the product proxy, which is the only hop that knows both the
 * admin's session and the upload's outcome. product-service is reached with a
 * service secret, so by the time bytes arrive the identity is already gone —
 * and a client-supplied user id would be a claim, not a fact.
 *
 * Deliberately best-effort: a failure here must never fail the upload. The
 * image is already stored and usable; losing a byline is a smaller harm than
 * an error on a screen where someone just waited for a file to transfer.
 */
export function objectKeyFromUrl(url: string): string | null {
  if (!url) return null;
  const withoutQuery = url.split("?")[0] ?? "";
  try {
    /** An absolute R2 URL: everything after the host is the key. */
    return new URL(withoutQuery).pathname.replace(/^\/+/, "") || null;
  } catch {
    /** Already a bare key, or a relative path. */
    return withoutQuery.replace(/^\/+/, "") || null;
  }
}

export async function recordUpload(args: {
  url: string;
  user: { id: string; name?: string | null; email?: string | null };
  originalName?: string | null;
  byteSize?: number | null;
}): Promise<void> {
  const objectKey = objectKeyFromUrl(args.url);
  if (!objectKey) return;

  try {
    await db
      .insert(mediaUploads)
      .values({
        objectKey,
        uploadedById: args.user.id,
        uploadedByName: args.user.name ?? null,
        uploadedByEmail: args.user.email ?? null,
        originalName: args.originalName ?? null,
        byteSize: args.byteSize ?? null,
      })
      /**
       * A repeated key is an overwrite, not a second file, so the later
       * uploader is the right answer rather than a duplicate row.
       */
      .onConflictDoUpdate({
        target: mediaUploads.objectKey,
        set: {
          uploadedById: args.user.id,
          uploadedByName: args.user.name ?? null,
          uploadedByEmail: args.user.email ?? null,
          originalName: args.originalName ?? null,
          byteSize: args.byteSize ?? null,
          uploadedAt: sql`now()`,
        },
      });
  } catch (err) {
    console.error("[media] could not record uploader:", err);
  }
}
