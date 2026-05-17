import { db } from "@repo/database";
import { users, passwordResetTokens } from "@repo/database";
import { eq, and, gt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { validatePassword, BCRYPT_COST } from "@repo/auth";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // SECURITY (audit M4): cap token-consume attempts per IP. The token itself
  // is 32 bytes of crypto-random hex (≈2^256 brute-force space) so guessing
  // is infeasible, but each call still drives a DB read + bcrypt.hash() at
  // cost 12. Without a limit an attacker can drive sustained CPU load. 30
  // requests / hour / IP is far above any plausible human flow (one click
  // from email → submit → maybe one retry).
  const limited = rateLimit(req, {
    bucket: "reset-password-consume",
    windowMs: 60 * 60_000,
    max: 30,
  });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { token, password } = body as { token?: string; password?: string };

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Ogiltig återställningslänk" },
        { status: 400 }
      );
    }

    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) {
      return NextResponse.json({ error: pwCheck.error }, { status: 400 });
    }

    const [resetRow] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.token, token),
          gt(passwordResetTokens.expires, new Date())
        )
      )
      .limit(1);

    if (!resetRow) {
      return NextResponse.json(
        { error: "Länken har gått ut eller är ogiltig. Begär en ny återställning." },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password as string, BCRYPT_COST);

    // A successful reset also verifies the email: the recipient demonstrably
    // controls the inbox the reset link was sent to. This is the recovery
    // path for existing credentials users blocked by H9 after the audit fix.
    await db
      .update(users)
      .set({ password: hashedPassword, emailVerified: new Date() })
      .where(eq(users.id, resetRow.userId));

    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.id, resetRow.id));

    return NextResponse.json({
      success: true,
      message: "Lösenordet har återställts. Du kan nu logga in.",
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return NextResponse.json(
      { error: "Något gick fel. Försök igen senare." },
      { status: 500 }
    );
  }
}
