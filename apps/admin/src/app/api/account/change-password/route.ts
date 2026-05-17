import { auth, validatePassword, BCRYPT_COST } from "@repo/auth";
import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireSameOrigin } from "@/lib/same-origin";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // SECURITY (audit M3): password change must come from the admin app itself.
  const csrfDenied = requireSameOrigin(req);
  if (csrfDenied) return csrfDenied;

  // SECURITY (audit M4): cap password-change attempts per IP. Each call
  // performs bcrypt.compare + bcrypt.hash at cost 12, so unthrottled abuse
  // by a compromised admin session (or a CSRF token leak that survives the
  // same-origin gate) can sustain meaningful CPU load. 10 / 15 min / IP
  // matches the storefront's forgot-password budget.
  const limited = rateLimit(req, {
    bucket: "admin-change-password",
    windowMs: 15 * 60_000,
    max: 10,
  });
  if (limited) return limited;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
    }

    const body = await req.json();
    const { currentPassword, newPassword } = body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || typeof currentPassword !== "string") {
      return NextResponse.json(
        { error: "Nuvarande lösenord krävs" },
        { status: 400 }
      );
    }

    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.ok) {
      return NextResponse.json({ error: pwCheck.error }, { status: 400 });
    }

    const [user] = await db
      .select({ id: users.id, password: users.password })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "Användare hittades inte" }, { status: 404 });
    }

    if (!user.password) {
      return NextResponse.json(
        { error: "Du är inloggad via ett externt konto. Lösenord kan inte ändras här." },
        { status: 400 }
      );
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return NextResponse.json(
        { error: "Nuvarande lösenord är felaktigt" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword as string, BCRYPT_COST);
    await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to change password:", err);
    return NextResponse.json(
      { error: "Kunde inte ändra lösenord" },
      { status: 500 }
    );
  }
}
