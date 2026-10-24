import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { listOrderEmails } from "@/lib/order-email-ledger";

/**
 * GET /api/orders/[id]/emails
 *
 * What the automation has sent to this customer, and when.
 *
 * Staff need this to answer "did they get told?" without digging through SMTP
 * logs — and to see that a mail was attempted and failed, which is otherwise
 * completely invisible. Before the ledger existed there was no record of any
 * customer mail at all.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (!Number.isFinite(orderId) || orderId < 1) {
    return NextResponse.json({ error: "Ogiltigt order-ID" }, { status: 400 });
  }

  try {
    const rows = await listOrderEmails(orderId);
    // Newest first; a claimed-but-unsent row sorts by when it was claimed.
    const emails = rows
      .map((r) => ({
        kind: r.kind,
        sentAt: r.sentAt?.toISOString() ?? null,
        claimedAt: r.claimedAt.toISOString(),
        recipient: r.recipient,
        error: r.error,
      }))
      .sort((a, b) => (b.sentAt ?? b.claimedAt).localeCompare(a.sentAt ?? a.claimedAt));

    return NextResponse.json({ emails });
  } catch (err) {
    console.error("[orders/emails]", err);
    return NextResponse.json({ error: "Kunde inte hämta utskick" }, { status: 500 });
  }
}
