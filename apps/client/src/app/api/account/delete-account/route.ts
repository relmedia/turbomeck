import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
    }

    const body = await req.json();
    const { password, confirmText } = body as {
      password?: string;
      confirmText?: string;
    };

    if (confirmText !== "ta bort mitt konto") {
      return NextResponse.json(
        { error: 'Skriv "ta bort mitt konto" för att bekräfta' },
        { status: 400 }
      );
    }

    const [user] = await db
      .select({ id: users.id, password: users.password })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "Användare hittades inte" }, { status: 404 });
    }

    // For credential users, verify password
    if (user.password) {
      if (!password || typeof password !== "string") {
        return NextResponse.json(
          { error: "Lösenord krävs för att ta bort kontot" },
          { status: 400 }
        );
      }
      const bcrypt = await import("bcryptjs");
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return NextResponse.json(
          { error: "Lösenordet är felaktigt" },
          { status: 400 }
        );
      }
    }

    await db.delete(users).where(eq(users.id, session.user.id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete account:", err);
    return NextResponse.json(
      { error: "Kunde inte ta bort kontot" },
      { status: 500 }
    );
  }
}
