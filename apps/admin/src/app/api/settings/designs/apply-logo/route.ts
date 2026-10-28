import { auth } from "@repo/auth";
import { NextResponse } from "next/server";

/**
 * Proxy for the logo transform.
 *
 * The transform lives in product-service beside the design builders and the
 * logo resolution, so there is one implementation — the same one a
 * verification harness ran against the real stored designs. A copy here could
 * drift from the one that was tested.
 *
 * Returns the modified design only. The HTML is re-exported by the editor in
 * the browser, because nothing else can produce it correctly.
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

  let base = (process.env.PRODUCT_SERVICE_URL || "http://localhost:8000").replace(/\/$/u, "");
  if (base.endsWith("/api")) base = base.slice(0, -4);

  try {
    const body = await req.json().catch(() => ({}));
    const res = await fetch(`${base}/api/email-templates/apply-logo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
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
    console.error("[designs/apply-logo]", err);
    return NextResponse.json({ error: "Kunde inte nå product-service" }, { status: 502 });
  }
}
