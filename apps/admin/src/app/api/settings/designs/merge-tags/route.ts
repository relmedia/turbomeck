import { auth } from "@repo/auth";
import { NextResponse } from "next/server";

/**
 * Proxy for the merge-tag catalogue.
 *
 * The list lives in product-service, next to the substitution that consumes
 * it, so the editor cannot offer a token that nothing fills in. Admin fetches
 * it rather than keeping a copy — a drifted second list would put a literal
 * "{{order_total}}" in a customer's inbox.
 */
export async function GET() {
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
    const res = await fetch(`${base}/api/email-templates/merge-tags`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `HTTP ${res.status}` }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch (err) {
    console.error("[designs/merge-tags]", err);
    return NextResponse.json({ error: "Kunde inte nå product-service" }, { status: 502 });
  }
}
