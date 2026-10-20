import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { fetchRefundQuote } from "@/lib/order-refunds";

/**
 * GET /api/orders/[id]/refundable
 *
 * What each charge on this order can still give back. Read-only, so the refund
 * panel can show real figures before anyone commits to anything.
 *
 * Returns no Stripe identifiers: charges are named by `kind`, and
 * product-service resolves kind → PaymentIntent from the order row. A tampered
 * refund request therefore cannot name an arbitrary charge in the account.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (!Number.isFinite(orderId) || orderId < 1) {
    return NextResponse.json({ error: "Ogiltigt order-ID" }, { status: 400 });
  }

  try {
    return NextResponse.json(await fetchRefundQuote(orderId));
  } catch (error) {
    const status = (error as { status?: number }).status ?? 502;
    const message =
      error instanceof Error ? error.message : "Kunde inte hämta återbetalningsinformation";
    // Not console.error: an unconfigured Stripe key is an expected state here,
    // and the panel renders the message rather than breaking the order page.
    console.warn(`[refundable] order ${orderId}: ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
