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
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    // SECURITY: this endpoint is publicly reachable (proxy.ts treats
    // /api/auth/** as public) and both apps share one `user` table, so a 409
    // "already exists" here was a working oracle for which STOREFRONT customers
    // are registered. Respond identically whether or not the address is taken,
    // and never return the row id — mirroring
    // apps/client/src/app/api/auth/sign-up/route.ts.
    const GENERIC_OK = {
      success: true,
      message: "Om e-posten är giltig kan du logga in via inloggningslänk.",
    };
    if (existing) {
      // Deliberately no password write: an attacker must not be able to set or
      // replace the password on an address they do not control. The owner's
      // recovery path is the storefront forgot-password flow.
      return NextResponse.json(GENERIC_OK);
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

    return NextResponse.json(GENERIC_OK);
  } catch (err) {
    console.error("Failed to create user:", err);
    return NextResponse.json(
      { error: "Kunde inte skapa användare" },
      { status: 500 }
    );
  }
}
