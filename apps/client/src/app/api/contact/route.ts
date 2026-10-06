import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendContactMessageEmail } from "@repo/auth";
import { rateLimit } from "@/lib/rate-limit";
import { requireSameOrigin } from "@/lib/same-origin";
import { requireTurnstile } from "@/lib/turnstile";

/**
 * POST /api/contact — deliver a contact-form message to the shop.
 *
 * An unauthenticated endpoint that sends mail is exactly the shape spammers
 * look for, so it carries the same four guards as the sign-up route:
 * same-origin, per-IP and per-email rate limits, a Turnstile challenge when
 * configured, and schema validation. Reusing those keeps one policy instead of
 * a second, weaker one.
 */

const contactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  subject: z.string().trim().min(2).max(120),
  message: z.string().trim().min(10).max(4000),
  turnstileToken: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const csrfDenied = requireSameOrigin(req);
  if (csrfDenied) return csrfDenied;

  // 10 messages/hour per IP is far above any genuine use of a contact form.
  const limited = rateLimit(req, {
    bucket: "contact-ip",
    windowMs: 60 * 60_000,
    max: 10,
  });
  if (limited) return limited;

  let parsed: z.infer<typeof contactSchema>;
  try {
    parsed = contactSchema.parse(await req.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? (err.issues[0]?.message ?? "Ogiltig förfrågan")
        : "Ogiltig förfrågan";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Per-sender cap as well: one IP can rotate addresses, and one address can be
  // used from many IPs.
  const perEmailLimited = rateLimit(req, {
    bucket: "contact-email",
    windowMs: 60 * 60_000,
    max: 5,
    key: parsed.email,
  });
  if (perEmailLimited) return perEmailLimited;

  const turnstileDenied = await requireTurnstile(req, parsed.turnstileToken);
  if (turnstileDenied) return turnstileDenied;

  try {
    const delivered = await sendContactMessageEmail({
      name: parsed.name,
      email: parsed.email,
      subject: parsed.subject,
      message: parsed.message,
    });
    if (!delivered) {
      // Mail isn't configured or has no recipient — say so rather than showing
      // a success screen for a message that went nowhere.
      return NextResponse.json(
        {
          error:
            "Kontaktformuläret är inte konfigurerat just nu. Mejla oss på shop@turbomeck.se.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[contact] send failed:", err);
    return NextResponse.json(
      { error: "Kunde inte skicka meddelandet. Försök igen senare." },
      { status: 502 },
    );
  }
}
