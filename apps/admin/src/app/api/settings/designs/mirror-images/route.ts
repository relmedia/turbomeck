import { auth } from "@repo/auth";
import { NextResponse } from "next/server";
import { isAssetMirrorConfigured, mirrorDesignImages } from "@/lib/r2-email-assets";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Moves a design's third-party images onto our own R2.
 *
 * Runs in admin because it downloads and re-uploads, and only admin holds the
 * R2 credentials. The logo is recognised by filename and rewritten to the one
 * canonical URL; every other image is copied as-is and repointed, because it
 * is content the shop chose and must not be replaced.
 *
 * Returns the rewritten design. Nothing is saved here — the caller re-exports
 * the HTML through the editor and saves both halves together.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAssetMirrorConfigured()) {
    return NextResponse.json(
      { error: "R2 är inte konfigurerat för bilduppladdning" },
      { status: 503 },
    );
  }

  const logoUrl = process.env.EMAIL_LOGO_URL?.trim();
  if (!logoUrl) {
    return NextResponse.json({ error: "EMAIL_LOGO_URL saknas" }, { status: 503 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { design?: Record<string, unknown> };
    if (!body.design || typeof body.design !== "object") {
      return NextResponse.json({ error: "Ingen design skickades" }, { status: 400 });
    }
    const report = await mirrorDesignImages(body.design, logoUrl);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[designs/mirror-images]", err);
    return NextResponse.json({ error: "Kunde inte flytta bilderna" }, { status: 500 });
  }
}
