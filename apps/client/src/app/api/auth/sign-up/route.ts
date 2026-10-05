import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { requireSameOrigin } from "@/lib/same-origin";
import { requireTurnstile } from "@/lib/turnstile";
import {
  PENDING_PROFILE_COOKIE,
  PENDING_PROFILE_MAX_AGE_SEC,
  serializePendingProfile,
} from "@/lib/pending-profile";

/**
 * POST /api/auth/sign-up
 *
 * Records the customer's intent to register. It deliberately does NOT create a
 * `user` row: the Auth.js Drizzle adapter creates the account when the magic
 * link is verified (`packages/auth/src/index.ts`), so a row written here would
 * be an unverified duplicate — and would let anyone pre-create an account for
 * somebody else's address. What this endpoint does is validate the input and
 * stash the display name for the verification step to pick up.
 *
 * The response is intentionally identical for every outcome that isn't a
 * malformed request, so it cannot be used to tell which addresses are
 * registered.
 */

/** Same shape for "new", "already exists" and "we didn't like it" alike. */
const GENERIC_OK = {
  success: true,
  message: "Om e-posten är giltig kan du logga in via inloggningslänk.",
} as const;

const signUpSchema = z.object({
  // 254 is the practical maximum length of an email address (RFC 5321).
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(80).optional(),
  acceptedTerms: z.literal(true, {
    message: "Du måste godkänna integritetspolicyn och köpvillkoren.",
  }),
  turnstileToken: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // SECURITY (audit M3): same-origin gate, as on the other state-changing
  // storefront endpoints.
  const csrfDenied = requireSameOrigin(req);
  if (csrfDenied) return csrfDenied;

  // SECURITY (audit M4): cap account-creation attempts per IP. The key comes
  // from `@repo/auth/client-ip`, which ignores the client-supplied first hop of
  // x-forwarded-for — otherwise this limit is one request header away from
  // being bypassed.
  const limited = rateLimit(req, {
    bucket: "client-sign-up",
    windowMs: 60 * 60_000,
    max: 20,
  });
  if (limited) return limited;

  let parsed: z.infer<typeof signUpSchema>;
  try {
    parsed = signUpSchema.parse(await req.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? (err.issues[0]?.message ?? "Ogiltig e-postadress")
        : "Ogiltig förfrågan";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Per-email cap on top of the per-IP one: without it a single IP can mail-bomb
  // one victim's inbox inside the IP budget, and many cheap IPs can do it anyway.
  const perEmailLimited = rateLimit(req, {
    bucket: "client-sign-up-email",
    windowMs: 60 * 60_000,
    max: 5,
    key: parsed.email,
  });
  if (perEmailLimited) return perEmailLimited;

  const turnstileDenied = await requireTurnstile(req, parsed.turnstileToken);
  if (turnstileDenied) return turnstileDenied;

  // The magic link that the client sends next is what actually creates the
  // account, and it is throttled in `packages/auth/src/index.ts`. Park the name
  // and the consent timestamp until there is a verified row to put them on —
  // see lib/pending-profile.ts.
  const response = NextResponse.json(GENERIC_OK);
  response.cookies.set({
    name: PENDING_PROFILE_COOKIE,
    value: serializePendingProfile({
      ...(parsed.name ? { name: parsed.name } : {}),
      termsAcceptedAt: new Date().toISOString(),
    }),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_PROFILE_MAX_AGE_SEC,
  });
  return response;
}
