import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { listOrderEmails } from "@/lib/order-email-ledger";
import { orderEmailState } from "@/lib/order-email-state";

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
        id: r.id,
        kind: r.kind,
        sentAt: r.sentAt?.toISOString() ?? null,
        claimedAt: r.claimedAt.toISOString(),
        recipient: r.recipient,
        error: r.error,
        /**
         * Derived here, from the same function the E-postlogg uses, so the two
         * views cannot disagree about a row. It is also the only way this
         * endpoint can distinguish a superseded row — `sentAt` set, nothing
         * emailed — from a real send; it previously could not, and showed both
         * as plain green.
         */
        state: orderEmailState(r),
      }))
      .sort((a, b) => (b.sentAt ?? b.claimedAt).localeCompare(a.sentAt ?? a.claimedAt));

    return NextResponse.json({ emails });
  } catch (err) {
    console.error("[orders/emails]", err);
    return NextResponse.json({ error: "Kunde inte hämta utskick" }, { status: 500 });
  }
}
