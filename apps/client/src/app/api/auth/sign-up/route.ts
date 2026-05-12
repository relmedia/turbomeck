import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

function generateId() {
  return randomBytes(16).toString("hex");
}

export async function POST(req: Request) {
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
