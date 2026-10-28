import { auth } from "@repo/auth";
import { NextResponse } from "next/server";

/**
 * Mails a design to the admin, filled with sample data, to check how it looks.
 *
 * The recipient defaults to the signed-in admin's own address, so the common
 * case needs no typing and a mistyped address cannot send a half-built
 * template to a customer. An explicit `to` is still honoured — testing how a
 * design renders in someone else's mail client is a real need — but only for a
 * signed-in admin, which is what keeps this from being an open relay.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const secret = process.env.INTERNAL_PRODUCT_API_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "INTERNAL_PRODUCT_API_SECRET saknas" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    to?: string;
    subject?: string;
    html?: string;
    locale?: string;
  };
  const to = (body.to ?? "").trim() || session.user.email || "";
  if (!to.includes("@")) {
    return NextResponse.json(
      { error: "Ingen mottagaradress — ditt konto saknar e-post" },
      { status: 400 },
    );
  }

  let base = (process.env.PRODUCT_SERVICE_URL || "http://localhost:8000").replace(/\/$/u, "");
  if (base.endsWith("/api")) base = base.slice(0, -4);

  try {
    const res = await fetch(`${base}/api/email-templates/test-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ to, subject: body.subject, html: body.html, locale: body.locale }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return NextResponse.json(
        { error: (json.error as string) ?? `HTTP ${res.status}` },
        { status: res.status },
      );
    }
    return NextResponse.json(json);
  } catch (err) {
    console.error("[designs/test-send]", err);
    return NextResponse.json({ error: "Kunde inte nå product-service" }, { status: 502 });
  }
}
