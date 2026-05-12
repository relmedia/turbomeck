import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import sharp from "sharp";
import {
  isR2Configured,
  uploadAvatarToR2,
} from "@/lib/r2-avatars";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
// SECURITY (audit M2): we re-encode every avatar through sharp into a fixed
// 512×512 WebP. This strips EXIF / ICC metadata (incl. GPS), neutralizes
// polyglot files that masquerade as images (the file pretends to be PNG, the
// bytes are actually HTML / SVG / a zip), and refuses anything sharp cannot
// decode — so the file we hand to R2 is provably the image we promised.
const NORMALIZED_DIM = 512;
const NORMALIZED_CONTENT_TYPE = "image/webp";
const NORMALIZED_EXT = ".webp";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
    }

    if (!isR2Configured()) {
      return NextResponse.json(
        {
          error:
            "Avatar-uppladdning kräver Cloudflare R2. Konfigurera R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL.",
        },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("avatar") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Ingen fil uppladdad" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Endast JPEG, PNG, GIF och WebP tillåts" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Filen får max vara 2 MB" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const rawBuffer = Buffer.from(bytes);

    let normalized: Buffer;
    try {
      normalized = await sharp(rawBuffer, { failOn: "error" })
        .rotate()
        .resize(NORMALIZED_DIM, NORMALIZED_DIM, {
          fit: "cover",
          withoutEnlargement: false,
        })
        .webp({ quality: 82, effort: 4 })
        .toBuffer();
    } catch {
      return NextResponse.json(
        { error: "Bilden kunde inte läsas. Försök med en annan fil." },
        { status: 400 }
      );
    }

    const imageUrl = await uploadAvatarToR2(
      session.user.id,
      normalized,
      NORMALIZED_CONTENT_TYPE,
      NORMALIZED_EXT
    );

    await db
      .update(users)
      .set({ image: imageUrl })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ success: true, image: imageUrl });
  } catch (err) {
    console.error("Failed to upload avatar:", err);
    return NextResponse.json(
      { error: "Kunde inte ladda upp bild" },
      { status: 500 }
    );
  }
}
