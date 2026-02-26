import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

function generateId() {
  return randomBytes(16).toString("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, name } = body as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return NextResponse.json(
        { error: "E-post och lösenord krävs" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing) {
      return NextResponse.json(
        { error: "En användare med denna e-post finns redan" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
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
