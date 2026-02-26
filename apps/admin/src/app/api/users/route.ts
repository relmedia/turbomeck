import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const rows = await db.select().from(users).limit(100);
    const list = rows.map((u) => ({
      id: u.id,
      avatar: u.image ?? "/users/1.png",
      fullName: u.name ?? "—",
      email: u.email ?? "—",
      status: "aktiv",
    }));
    return NextResponse.json(list);
  } catch (err) {
    console.error("Failed to fetch users:", err);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
