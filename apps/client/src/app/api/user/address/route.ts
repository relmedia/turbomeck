import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSameOrigin } from "@/lib/same-origin";

const savedAddressKeys = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "country",
  "address",
  "city",
  "postalCode",
] as const;

function isValidSavedAddress(body: unknown): body is Record<string, string> {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return savedAddressKeys.every(
    (k) => typeof b[k] === "string" && (b[k] as string).trim().length > 0
  );
}

export async function POST(req: Request) {
  // SECURITY (audit M3): same-origin gate on cookie-auth state change.
  const csrfDenied = requireSameOrigin(req);
  if (csrfDenied) return csrfDenied;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!isValidSavedAddress(body)) {
    return NextResponse.json(
      { error: "Invalid address data" },
      { status: 400 }
    );
  }

  const b = body as Record<string, string>;
  const savedAddress = {
    firstName: b.firstName!.trim(),
    lastName: b.lastName!.trim(),
    email: b.email!.trim(),
    phone: b.phone!.trim(),
    country: (b.country ?? "SE").trim(),
    address: b.address!.trim(),
    city: b.city!.trim(),
    postalCode: b.postalCode!.trim(),
  };

  try {
    // SECURITY (audit M10): narrow projection — only the fields we need to merge.
    const [user] = await db
      .select({ name: users.name, metadata: users.metadata })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const fullName = `${savedAddress.firstName} ${savedAddress.lastName}`.trim();
    await db
      .update(users)
      .set({
        name: fullName || user.name,
        metadata: { ...user.metadata, savedAddress },
      })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to save address:", err);
    return NextResponse.json(
      { error: "Failed to save address" },
      { status: 500 }
    );
  }
}
