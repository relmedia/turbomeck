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
    const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    
    if (existing) {
      // User already exists - that's fine for magic link flow
      // They can just use the login flow
      return NextResponse.json({ 
        success: true, 
        userId: existing.id,
        message: "User already exists, use login instead"
      });
    }

    const id = generateId();

    await db.insert(users).values({
      id,
      email: normalizedEmail,
      name: name?.trim() || null,
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
