import { db } from "@repo/database";
import { users, passwordResetTokens } from "@repo/database";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

function generateToken() {
  return randomBytes(32).toString("hex");
}

function getBaseUrl(req: Request): string {
  const origin = req.headers.get("origin") || req.headers.get("referer");
  if (origin) {
    try {
      const url = new URL(origin);
      return `${url.protocol}//${url.host}`;
    } catch {
      // ignore
    }
  }
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body as { email?: string };

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "E-postadress krävs" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    // Always return success to avoid revealing if email exists
    if (!user?.password) {
      return NextResponse.json({
        success: true,
        message: "Om ett konto finns för denna e-post har vi skickat en återställningslänk.",
      });
    }

    const token = generateToken();
    const id = randomBytes(16).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(passwordResetTokens).values({
      id,
      userId: user.id,
      token,
      expires,
    });

    const baseUrl = getBaseUrl(req);
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    return NextResponse.json({
      success: true,
      message: "Om ett konto finns för denna e-post har vi skickat en återställningslänk.",
      // Dev only: expose link when no email provider is configured
      ...(process.env.NODE_ENV === "development" && { resetUrl }),
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return NextResponse.json(
      { error: "Något gick fel. Försök igen senare." },
      { status: 500 }
    );
  }
}
