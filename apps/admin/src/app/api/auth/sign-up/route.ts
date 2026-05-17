import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { validatePassword, BCRYPT_COST } from "@repo/auth";
import { rateLimit } from "@/lib/rate-limit";

function generateId() {
  return randomBytes(16).toString("hex");
}

export async function POST(req: NextRequest) {
  // SECURITY (audit M4): admin sign-up is publicly reachable (proxy.ts treats
  // /api/auth/** as public). Without throttling an attacker can spam this
  // endpoint to flood the `user` table or to burn bcrypt CPU at cost-12.
  // 10 / hour / IP is plenty for the rare new-admin onboarding case; real
  // admins are usually added via ADMIN_ALLOWLIST or the set-admin-password
  // script.
  const limited = rateLimit(req, {
    bucket: "admin-sign-up",
    windowMs: 60 * 60_000,
    max: 10,
  });
  if (limited) return limited;

  try {
    const body = await req.json();
    // SECURITY: `role` is intentionally NOT read from the client. This endpoint
    // is publicly reachable (proxy.ts treats /api/auth/** as public), so trusting
    // a client-supplied role would let anyone create an admin account. Admin
    // access is granted out-of-band via ADMIN_ALLOWLIST or the
    // packages/database/src/set-admin-password.ts script.
    const { email, password, name } = body as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "E-post krävs" },
        { status: 400 }
      );
    }
    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) {
      return NextResponse.json({ error: pwCheck.error }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing) {
      return NextResponse.json(
        { error: "En användare med denna e-post finns redan" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password as string, BCRYPT_COST);
    const id = generateId();

    await db.insert(users).values({
      id,
      email: normalizedEmail,
      name: name?.trim() || null,
      password: hashedPassword,
      role: "customer",
    });

    return NextResponse.json({ success: true, userId: id });
  } catch (err) {
    console.error("Failed to create user:", err);
    return NextResponse.json(
      { error: "Kunde inte skapa användare" },
      { status: 500 }
    );
  }
}
