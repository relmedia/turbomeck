import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

function getFullName(u: { name: string | null; metadata?: unknown }): string {
  const meta = u.metadata as { savedAddress?: Record<string, unknown> } | null | undefined;
  const saved = meta?.savedAddress;
  if (saved && typeof saved === "object") {
    const first = (saved.firstName ?? saved.first_name) as string | undefined;
    const last = (saved.lastName ?? saved.last_name) as string | undefined;
    if (first != null || last != null) {
      const full = [first ?? "", last ?? ""].filter(Boolean).join(" ").trim();
      if (full) return full;
    }
  }
  return u.name ?? "—";
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  try {
    const rows = await db.select().from(users).limit(100);
    const list = rows.map((u) => ({
      id: u.id,
      avatar: u.image ?? "/users/1.png",
      fullName: getFullName(u),
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
