import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const client = await clerkClient();
    const response = await client.users.getUserList({ limit: 100 });
    const users = response.data.map((u) => ({
      id: u.id,
      avatar: u.imageUrl ?? "/users/1.png",
      fullName: [u.firstName, u.lastName].filter(Boolean).join(" ") || "—",
      email: u.primaryEmailAddress?.emailAddress ?? "—",
      status: u.banned ? "inaktiv" : "aktiv",
    }));
    return NextResponse.json(users);
  } catch (err) {
    console.error("Failed to fetch users:", err);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
