import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import {
  PENDING_PROFILE_COOKIE,
  parsePendingProfile,
} from "@/lib/pending-profile";
import { claimGuestOrdersForRow } from "@/lib/claim-guest-orders";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // SECURITY (audit M10): narrow the select so the password hash never even
  // touches process memory for this handler. `hasPassword` is computed in SQL.
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      // Needed by the guest-order claim below; a timestamp, so it does not
      // widen what the audit comment above is protecting.
      emailVerified: users.emailVerified,
      image: users.image,
      createdAt: users.createdAt,
      metadata: users.metadata,
      hasPassword: sql<boolean>`${users.password} is not null`,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // The sign-up form collects a name and a terms acceptance before the account
  // exists — /api/auth/sign-up no longer writes an unverified row, so those are
  // parked in a short-lived cookie and claimed here, on the first authenticated
  // read after the magic link is verified.
  let name = user.name;
  const jar = await cookies();
  const pending = parsePendingProfile(jar.get(PENDING_PROFILE_COOKIE)?.value);
  if (pending && (!name || !user.metadata?.termsAcceptedAt)) {
    name = name || pending.name || null;
    await db
      .update(users)
      .set({
        name,
        metadata: {
          ...(user.metadata ?? {}),
          ...(user.metadata?.termsAcceptedAt
            ? {}
            : { termsAcceptedAt: pending.termsAcceptedAt }),
        },
      })
      .where(eq(users.id, user.id));
    jar.delete(PENDING_PROFILE_COOKIE);
  }

  /**
   * Attach any orders placed as a guest with this (now verified) address.
   *
   * Runs after the pending-profile write, not inside it: it must happen for
   * every verified user, including ones who registered long before guest
   * checkout existed. Ordering matters — the claim merges its marker in SQL,
   * so it cannot clobber the `termsAcceptedAt` written just above, but a
   * whole-object write in the other order would.
   */
  await claimGuestOrdersForRow({
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    metadata: user.metadata,
  });

  const savedAddress = user.metadata?.savedAddress;
  return NextResponse.json({
    id: user.id,
    name,
    email: user.email,
    image: user.image,
    createdAt: user.createdAt,
    savedAddress,
    hasPassword: !!user.hasPassword,
  });
}
