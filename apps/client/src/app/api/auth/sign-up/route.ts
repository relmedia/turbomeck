import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { rateLimit } from "@/lib/rate-limit";

function generateId() {
  return randomBytes(16).toString("hex");
}

export async function POST(req: NextRequest) {
  // SECURITY (audit M4): cap account-creation attempts per IP. Without this
  // an attacker can spam this endpoint to enumerate the existence-vs-no-
  // existence timing difference (we already constant-shape the response, so
  // this is belt-and-braces) and to bloat the `user` table with bogus rows
  // that pollute the admin UI and increase storage cost. 20 / hour / IP is
  // far above any plausible human use of the magic-link signup flow.
  const limited = rateLimit(req, {
    bucket: "client-sign-up",
    windowMs: 60 * 60_000,
    max: 20,
  });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { email, name } = body as {
      email?: string;
      name?: string;
    };

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "E-post krävs" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    // SECURITY: do NOT differentiate the response between "newly created" and
    // "already exists", and never return the existing row's id. Returning
    // distinct shapes / known ids lets an attacker enumerate which emails are
    // registered. The downstream magic-link flow doesn't need the id either —
    // it looks the user up by email itself.
    if (existing) {
      return NextResponse.json({
        success: true,
        message: "Om e-posten är giltig kan du logga in via inloggningslänk.",
      });
    }

    const id = generateId();
    await db.insert(users).values({
      id,
      email: normalizedEmail,
      name: name?.trim() || null,
      role: "customer",
    });

    return NextResponse.json({
      success: true,
      message: "Om e-posten är giltig kan du logga in via inloggningslänk.",
    });
  } catch (err) {
    console.error("Failed to create user:", err);
    return NextResponse.json(
      { error: "Kunde inte skapa användare" },
      { status: 500 }
    );
  }
}
