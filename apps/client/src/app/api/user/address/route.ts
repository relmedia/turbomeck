import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/** Shape of saved address stored in Clerk publicMetadata */
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
  const { userId } = await auth();
  if (!userId) {
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
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: { savedAddress },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to update user address metadata:", err);
    return NextResponse.json(
      { error: "Failed to save address" },
      { status: 500 }
    );
  }
}
