import { auth } from "@repo/auth";
import { NextResponse } from "next/server";

/**
 * The migration payload: the compiled email templates as builder designs.
 *
 * Built in product-service from the same copy the compiled templates read, so
 * a migrated design says what the email it replaces says. No HTML comes back —
 * only Unlayer can render a design, and Unlayer runs in the browser.
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
    const res = await fetch(`${base}/api/email-templates/seed`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `HTTP ${res.status}` }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch (err) {
    console.error("[designs/seed]", err);
    return NextResponse.json({ error: "Kunde inte nå product-service" }, { status: 502 });
  }
}
