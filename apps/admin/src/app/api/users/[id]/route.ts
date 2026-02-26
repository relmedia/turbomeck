import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const saved = user.metadata?.savedAddress as
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
      firstName: saved?.firstName ?? user.name?.split(" ")[0] ?? "",
      lastName: saved?.lastName ?? user.name?.split(" ").slice(1).join(" ") ?? "",
      fullName: user.name ?? "—",
      email: user.email ?? "—",
      imageUrl: user.image,
      createdAt: null,
      lastSignInAt: null,
      phone: saved?.phone ?? "—",
      address: saved?.address ?? "—",
      city: saved?.city ?? "—",
      postalCode: saved?.postalCode ?? "—",
      country: saved?.country ?? "SE",
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

    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const currentMetadata = user.metadata ?? {};
    const currentAddress = currentMetadata.savedAddress ?? {};

    const nameUpdate = body.firstName != null || body.lastName != null
      ? [body.firstName ?? currentAddress.firstName ?? "", body.lastName ?? currentAddress.lastName ?? ""].filter(Boolean).join(" ")
      : undefined;

    const savedAddress =
      body.address && typeof body.address === "object"
        ? {
            ...currentAddress,
            firstName: body.firstName ?? currentAddress.firstName ?? user.name?.split(" ")[0] ?? "",
            lastName: body.lastName ?? currentAddress.lastName ?? user.name?.split(" ").slice(1).join(" ") ?? "",
            email: currentAddress.email ?? user.email ?? "",
            phone: body.address.phone ?? currentAddress.phone ?? "",
            address: body.address.address ?? currentAddress.address ?? "",
            city: body.address.city ?? currentAddress.city ?? "",
            postalCode: currentAddress.postalCode ?? "",
            country: currentAddress.country ?? "SE",
          }
        : undefined;

    await db
      .update(users)
      .set({
        ...(nameUpdate != null && { name: nameUpdate }),
        ...(body.email != null && { email: body.email }),
        ...(savedAddress != null && {
          metadata: { ...currentMetadata, savedAddress },
        }),
      })
      .where(eq(users.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to update user:", err);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
