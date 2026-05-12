import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import path from "path";
import {
  isR2Configured,
  uploadAvatarToR2,
} from "@/lib/r2-avatars";
import { requireAdmin } from "@/lib/require-admin";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { session } = gate;
  try {
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

    const ext = path.extname(file.name) || ".png";
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const imageUrl = await uploadAvatarToR2(
      session.user.id,
      buffer,
      file.type,
      ext
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
