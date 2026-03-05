import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** POST /api/account/sync-name - Sync user.name from savedAddress when out of date */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const saved = (user.metadata as { savedAddress?: { firstName?: string; lastName?: string } })?.savedAddress;
    if (!saved?.firstName && !saved?.lastName) {
      return NextResponse.json({ synced: false, reason: "no saved address" });
    }

    const fullName = [saved.firstName ?? "", saved.lastName ?? ""].filter(Boolean).join(" ").trim();
    if (!fullName) return NextResponse.json({ synced: false });

    if (user.name === fullName) {
      return NextResponse.json({ synced: true, alreadyUpToDate: true });
    }

    await db.update(users).set({ name: fullName }).where(eq(users.id, session.user.id));
    return NextResponse.json({ synced: true });
  } catch (err) {
    console.error("Sync name failed:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
