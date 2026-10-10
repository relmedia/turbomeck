import { db } from "@repo/database";
import { orders, users } from "@repo/database/schema";
import { and, eq, sql } from "drizzle-orm";

/**
 * Attach a verified account's pre-account guest orders to it, matched on email.
 *
 * Guest checkout writes orders with a NULL `userId` (the buyer had no account),
 * so without this an account created after the fact shows an empty history. The
 * runtime counterpart of `packages/database/scripts/backfill-order-user-ids.ts`,
 * which does the same match as a one-off.
 *
 * SECURITY — the `emailVerified` gate is the whole basis of this being safe.
 * Claiming by email is sound only because the account's mailbox has been proven:
 * a magic-link sign-up sets `emailVerified`, and so does the reset-password
 * flow. Drop that check and this becomes a way to inherit a stranger's order
 * history by registering their address.
 *
 * Known trade-off, accepted: `orders.email` is buyer-supplied free text, so
 * someone can place a guest order against an address they do not own and have
 * it land in that person's history once they register. The data flows toward
 * the victim rather than away from them — the attacker leaks their own address
 * and items, and gains no read access — but note that `api/reviews/eligibility`
 * keys on `orders.userId`, so an injected order also confers a spurious
 * "verified buyer" right on the victim. Claims are logged below so this is
 * auditable. Anchoring the claim to a `viewToken` held in a cookie would close
 * it, at the cost of cross-device claiming.
 */

/**
 * How long a claim result is trusted before re-checking.
 *
 * A throttle rather than a one-shot flag, because orders keep arriving that
 * need claiming: an existing customer who checks out signed-out — another
 * device, cleared cookies, a private window — produces a NULL-`userId` order
 * that matches their email. A permanent latch would never pick those up.
 */
const CLAIM_THROTTLE_MS = 10 * 60_000;

type ClaimableUser = {
  id: string;
  email: string | null;
  emailVerified: Date | null;
  metadata: (typeof users.$inferSelect)["metadata"];
};

/**
 * Claims for an already-loaded user row. Returns the number of orders attached.
 * Never throws: a failed claim must degrade to a short history, never to a 500
 * on a profile read or an order list.
 */
export async function claimGuestOrdersForRow(
  user: ClaimableUser,
): Promise<number> {
  try {
    const email = user.email?.trim().toLowerCase();
    if (!email) return 0;
    if (!user.emailVerified) return 0;

    const last = user.metadata?.ordersClaimedAt;
    if (last && Date.now() - Date.parse(last) < CLAIM_THROTTLE_MS) return 0;

    const claimed = await db
      .update(orders)
      .set({ userId: user.id })
      .where(
        and(
          // NULL or blank, matching the backfill script's btrim() guard.
          sql`(${orders.userId} is null or btrim(${orders.userId}) = '')`,
          sql`lower(btrim(${orders.email})) = ${email}`,
        ),
      )
      .returning({ id: orders.id });

    // Merged in SQL rather than read-modify-write: this runs alongside the
    // pending-profile write in `api/user/me`, and a whole-object `set` would
    // clobber whichever of the two landed first.
    await db
      .update(users)
      .set({
        metadata: sql`coalesce(${users.metadata}, '{}'::jsonb) || ${JSON.stringify(
          { ordersClaimedAt: new Date().toISOString() },
        )}::jsonb`,
      })
      .where(eq(users.id, user.id));

    if (claimed.length > 0) {
      console.info(
        `[claim-guest-orders] attached ${claimed.length} order(s) to user ${user.id}`,
      );
    }
    return claimed.length;
  } catch (err) {
    console.error("[claim-guest-orders] failed", err);
    return 0;
  }
}

/** Same, for call sites that hold only a session user id. */
export async function claimGuestOrders(userId: string): Promise<number> {
  try {
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        metadata: users.metadata,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ? claimGuestOrdersForRow(row) : 0;
  } catch (err) {
    console.error("[claim-guest-orders] lookup failed", err);
    return 0;
  }
}
