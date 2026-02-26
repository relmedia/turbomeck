import { db } from "@repo/database";
import { users, passwordResetTokens } from "@repo/database";
import { eq, and, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token, password } = body as { token?: string; password?: string };

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Ogiltig återställningslänk" },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "Lösenordet måste vara minst 6 tecken" },
        { status: 400 }
      );
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

    const hashedPassword = await bcrypt.hash(password, 10);

    await db
      .update(users)
      .set({ password: hashedPassword })
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
