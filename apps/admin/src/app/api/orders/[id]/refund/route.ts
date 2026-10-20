import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { requireSameOrigin } from "@/lib/same-origin";
import { rateLimit } from "@/lib/rate-limit";
import { postOrderRefund, type ChargeKind } from "@/lib/order-refunds";

const VALID_KINDS: ChargeKind[] = ["full", "deposit", "balance"];

/**
 * POST /api/orders/[id]/refund
 *
 * Issues one Stripe refund against one charge of this order.
 *
 * Three gates rather than one: refunds move real money and cannot be reversed,
 * so this is not a route to protect only by the proxy matcher. `requireAdmin`
 * is the defence-in-depth check every admin handler makes, `requireSameOrigin`
 * stops a cross-site POST riding a staff session, and the rate limit caps the
 * blast radius if either is ever circumvented.
 *
 * The actual Stripe call, the DB write and the customer email all happen in
 * product-service — see apps/product-service/src/order-refunds.ts.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const sameOrigin = requireSameOrigin(req);
  if (sameOrigin) return sameOrigin;

  const limited = rateLimit(req, { bucket: "order-refund", windowMs: 60_000, max: 10 });
  if (limited) return limited;

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (!Number.isFinite(orderId) || orderId < 1) {
    return NextResponse.json({ error: "Ogiltigt order-ID" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    kind?: string;
    amount?: number | string;
    requestId?: string;
    note?: string;
    notifyCustomer?: boolean;
  };

  const kind = String(body.kind ?? "") as ChargeKind;
  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: "Ogiltig betalning vald" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Ogiltigt belopp" }, { status: 400 });
  }

  const requestId = String(body.requestId ?? "").trim();
  if (!requestId) {
    return NextResponse.json({ error: "requestId saknas" }, { status: 400 });
  }

  // Any admin may refund, so this is the whole audit trail. Written
  // unconditionally, never behind a debug flag.
  const performedBy = gate.session.user.email ?? gate.session.user.id;

  try {
    const result = await postOrderRefund({
      orderId,
      kind,
      amount,
      requestId,
      note: body.note ?? null,
      performedBy,
      notifyCustomer: body.notifyCustomer !== false,
    });
    return NextResponse.json(result);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 502;
    const message = error instanceof Error ? error.message : "Kunde inte återbetala";
    console.error(
      `[refund] order ${orderId} kind=${kind} amount=${amount} by=${performedBy} failed: ${message}`,
    );
    return NextResponse.json({ error: message }, { status });
  }
}
