import { db } from "@repo/database";
import { users, passwordResetTokens } from "@repo/database";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { sendPasswordResetEmail } from "@repo/auth";
import { rateLimit } from "@/lib/rate-limit";

function generateToken() {
  return randomBytes(32).toString("hex");
}

/**
 * SECURITY: the base URL is derived from `NEXT_PUBLIC_APP_URL` only. Previously
 * we honored the request `Origin`/`Referer` headers, which would let an
 * attacker who can craft a `POST /api/auth/forgot-password` with a forged
 * Origin send the victim a reset link pointing at the attacker's host.
 */
function getBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002").replace(
    /\/$/,
    "",
  );
}

export async function POST(req: NextRequest) {
  // SECURITY (audit M4): without a per-IP cap an attacker can drive cost
  // amplification (one POST = one SMTP send + one DB write) against this
  // endpoint cheaply. 10 requests / 15 min per IP fits any human use of the
  // "forgot password" flow.
  const limited = rateLimit(req, {
    bucket: "forgot-password",
    windowMs: 15 * 60_000,
    max: 10,
  });
  if (limited) return limited;

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

    // Invalidate any previously-issued tokens for this user so a leaked older
    // token cannot be replayed and so the table doesn't grow unbounded.
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));

    const token = generateToken();
    const id = randomBytes(16).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(passwordResetTokens).values({
      id,
      userId: user.id,
      token,
      expires,
    });

    const baseUrl = getBaseUrl();
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    let delivered = false;
    try {
      delivered = await sendPasswordResetEmail({
        to: normalizedEmail,
        url: resetUrl,
      });
    } catch (mailErr) {
      console.error("[forgot-password] failed to send email:", mailErr);
    }

    return NextResponse.json({
      success: true,
      message: "Om ett konto finns för denna e-post har vi skickat en återställningslänk.",
      // Dev: expose link when email isn't configured so local testing works
      ...(process.env.NODE_ENV === "development" && !delivered && { resetUrl }),
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return NextResponse.json(
      { error: "Något gick fel. Försök igen senare." },
      { status: 500 }
    );
  }
}
