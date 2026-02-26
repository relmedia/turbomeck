import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = await clerkClient();
    const user = await client.users.getUser(id);
    const savedAddress = user.publicMetadata?.savedAddress as
      | {
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
        address?: string;
        city?: string;
        postalCode?: string;
        country?: string;
      }
      | undefined;
    return NextResponse.json({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "—",
      email: user.primaryEmailAddress?.emailAddress ?? "—",
      imageUrl: user.imageUrl,
      createdAt: user.createdAt,
      lastSignInAt: user.lastSignInAt,
      phone: savedAddress?.phone ?? user.primaryPhoneNumber?.phoneNumber ?? "—",
      address: savedAddress?.address ?? "—",
      city: savedAddress?.city ?? "—",
      postalCode: savedAddress?.postalCode ?? "—",
      country: savedAddress?.country ?? "—",
    });
  } catch (err) {
    console.error("Failed to fetch user:", err);
    return NextResponse.json(
      { error: "User not found" },
      { status: 404 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const client = await clerkClient();

    const updates: Parameters<typeof client.users.updateUser>[1] = {};

    if (body.firstName != null) updates.firstName = String(body.firstName);
    if (body.lastName != null) updates.lastName = String(body.lastName);

    if (body.address && typeof body.address === "object") {
      const user = await client.users.getUser(id);
      const currentAddress = (user.publicMetadata?.savedAddress as Record<string, string> | undefined) ?? {};
      const savedAddress = {
        ...currentAddress,
        firstName: body.firstName ?? currentAddress.firstName ?? user.firstName ?? "",
        lastName: body.lastName ?? currentAddress.lastName ?? user.lastName ?? "",
        email: currentAddress.email ?? user.primaryEmailAddress?.emailAddress ?? "",
        phone: body.address.phone ?? currentAddress.phone ?? "",
        address: body.address.address ?? currentAddress.address ?? "",
        city: body.address.city ?? currentAddress.city ?? "",
        postalCode: currentAddress.postalCode ?? "",
        country: currentAddress.country ?? "SE",
      };
      updates.publicMetadata = { ...user.publicMetadata, savedAddress };
    }

    await client.users.updateUser(id, updates);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to update user:", err);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
