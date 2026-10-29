import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { mediaUploads, products, emailDesigns } from "@repo/database/schema";
import { NextResponse } from "next/server";
import { objectKeyFromUrl } from "@/lib/media-uploads";

export const runtime = "nodejs";

/**
 * Every image in storage, with everything known about it.
 *
 * Three sources, because no single one knows enough:
 *
 *  - **R2** has the files — key, size, last modified. It is the only place
 *    that knows what actually exists, so it is the spine of the list.
 *  - **media_uploads** has who uploaded it. R2 does not record that and
 *    cannot be made to; rows only exist for uploads since that table was
 *    added, so older images report an unknown uploader rather than a guess.
 *  - **products and email designs** say where an image is used. That is what
 *    turns the page from a file listing into something you can act on —
 *    "unused" is the only safe answer to "can I delete this".
 *
 * Usage is computed here rather than per row in the browser: it needs the
 * whole catalogue, and doing it once server-side is one pass instead of one
 * per image.
 */

type Usage = { kind: "product" | "design"; id: number; name: string };

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const secret = process.env.INTERNAL_PRODUCT_API_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "INTERNAL_PRODUCT_API_SECRET saknas" }, { status: 503 });
  }

  let base = (process.env.PRODUCT_SERVICE_URL || "http://localhost:8000").replace(/\/$/u, "");
  if (base.endsWith("/api")) base = base.slice(0, -4);

  try {
    const [storageRes, uploads, productRows, designRows] = await Promise.all([
      fetch(`${base}/api/media`, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
      }),
      db
        .select({
          objectKey: mediaUploads.objectKey,
          uploadedByName: mediaUploads.uploadedByName,
          uploadedByEmail: mediaUploads.uploadedByEmail,
          originalName: mediaUploads.originalName,
          uploadedAt: mediaUploads.uploadedAt,
        })
        .from(mediaUploads),
      db
        .select({
          id: products.id,
          name: products.name,
          image: products.image,
          thumbnails: products.thumbnails,
        })
        .from(products),
      db
        .select({ id: emailDesigns.id, name: emailDesigns.name, html: emailDesigns.html })
        .from(emailDesigns),
    ]);

    if (!storageRes.ok) {
      return NextResponse.json(
        { error: `Kunde inte läsa lagringen (HTTP ${storageRes.status})` },
        { status: 502 },
      );
    }
    const storage = (await storageRes.json()) as {
      objects?: Array<{ key: string; url: string; size: number; lastModified: string | null }>;
      storage?: string;
    };

    const uploaderByKey = new Map(uploads.map((u) => [u.objectKey, u]));

    /**
     * Which products use which object.
     *
     * Keyed on the object key, not the stored URL: those carry a ?v=
     * cache-buster and an absolute host that has changed before, so string
     * equality would under-report usage — and an image wrongly shown as
     * unused is one somebody deletes.
     */
    const usageByKey = new Map<string, Usage[]>();
    const addUsage = (rawUrl: string | null | undefined, usage: Usage) => {
      const key = objectKeyFromUrl(rawUrl ?? "");
      if (!key) return;
      usageByKey.set(key, [...(usageByKey.get(key) ?? []), usage]);
    };

    for (const p of productRows) {
      const usage: Usage = { kind: "product", id: p.id, name: p.name };
      addUsage(p.image, usage);
      for (const t of (p.thumbnails as string[] | null) ?? []) addUsage(t, usage);
    }

    /**
     * Designs are searched by substring: an email's HTML is Unlayer's export,
     * not a list of fields, so there is nothing to read the URLs out of.
     */
    const designUsage: Array<{ id: number; name: string; html: string }> = designRows.map((d) => ({
      id: d.id,
      name: d.name,
      html: d.html ?? "",
    }));

    const objects = (storage.objects ?? []).map((obj) => {
      const uploader = uploaderByKey.get(obj.key);
      const usedBy = [...(usageByKey.get(obj.key) ?? [])];
      for (const d of designUsage) {
        if (d.html.includes(obj.key)) usedBy.push({ kind: "design", id: d.id, name: d.name });
      }

      /**
       * The folder is the first path segment: products/, avatars/, branding/,
       * email-assets/. It is the most useful filter on this page because it
       * maps to what an image is FOR.
       */
      const folder = obj.key.includes("/") ? obj.key.split("/")[0]! : "övrigt";
      const filename = obj.key.split("/").pop() ?? obj.key;

      return {
        key: obj.key,
        url: obj.url,
        filename,
        folder,
        size: obj.size,
        /**
         * The recorded upload time when there is one, and R2's last-modified
         * otherwise. They differ: last-modified changes if an object is
         * rewritten, and is all that exists for images predating the table.
         */
        uploadedAt: uploader?.uploadedAt?.toISOString() ?? obj.lastModified,
        uploadedAtIsExact: Boolean(uploader),
        uploadedByName: uploader?.uploadedByName ?? null,
        uploadedByEmail: uploader?.uploadedByEmail ?? null,
        originalName: uploader?.originalName ?? null,
        usedBy,
      };
    });

    return NextResponse.json({
      objects,
      storage: storage.storage ?? "unknown",
      /** So the page can explain why some rows have no uploader. */
      trackedSince: uploads.length > 0 ? "partial" : "none",
    });
  } catch (err) {
    console.error("[media]", err);
    return NextResponse.json({ error: "Kunde inte hämta mediabiblioteket" }, { status: 502 });
  }
}
