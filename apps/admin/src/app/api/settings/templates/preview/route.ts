import { auth } from "@repo/auth";
import { NextResponse } from "next/server";

/**
 * Proxy for the email preview.
 *
 * The renderers live in product-service, and its /api routes are gated by the
 * internal bearer — which a browser tab opening a link cannot supply. So admin
 * fetches it server-side with the secret and streams the HTML back.
 *
 * It also keeps product-service off the public internet for this: the preview
 * is only ever reachable through an authenticated admin session.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = process.env.INTERNAL_PRODUCT_API_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "INTERNAL_PRODUCT_API_SECRET saknas i admin-miljön." },
      { status: 503 },
    );
  }

  let base = (process.env.PRODUCT_SERVICE_URL || "http://localhost:8000").replace(/\/$/u, "");
  if (base.endsWith("/api")) base = base.slice(0, -4);

  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const locale = url.searchParams.get("locale") === "en" ? "en" : "sv";

  try {
    const res = await fetch(
      `${base}/api/email-templates/preview?key=${encodeURIComponent(key)}&locale=${locale}`,
      { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" },
    );
    const body = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: `Förhandsgranskning misslyckades (HTTP ${res.status})`, details: body.slice(0, 400) },
        { status: res.status },
      );
    }
    return new NextResponse(body, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[templates/preview]", err);
    return NextResponse.json({ error: "Kunde inte nå product-service" }, { status: 502 });
  }
}
