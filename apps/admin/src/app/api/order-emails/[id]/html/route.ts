import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getArchivedOrderEmail } from "@/lib/order-email-ledger";
import { orderEmailLabel, orderEmailState } from "@/lib/order-email-state";

/**
 * The archived copy of one sent mail.
 *
 * Returns JSON rather than serving the HTML directly as a document: the
 * preview page puts it in a sandboxed iframe, so the email's own CSS cannot
 * touch the admin UI and nothing in it can execute. Handing the browser the
 * raw body at its own URL would give that markup the admin origin.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const rowId = parseInt(id, 10);
  if (!Number.isFinite(rowId) || rowId < 1) {
    return NextResponse.json({ error: "Ogiltigt ID" }, { status: 400 });
  }

  try {
    const row = await getArchivedOrderEmail(rowId);
    if (!row) {
      return NextResponse.json({ error: "Utskicket finns inte" }, { status: 404 });
    }

    return NextResponse.json({
      id: row.id,
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      kind: row.kind,
      label: orderEmailLabel(row.kind),
      state: orderEmailState(row),
      subject: row.subject,
      sentAt: row.sentAt ? row.sentAt.toISOString() : null,
      recipient: row.recipient,
      /**
       * Null when the mail predates archiving, or when the row is one the
       * poller ticked off without sending. The page distinguishes the two from
       * `state` rather than guessing from an empty body.
       */
      html: row.html && row.html.trim() ? row.html : null,
    });
  } catch (err) {
    console.error("[order-emails/html]", err);
    return NextResponse.json({ error: "Kunde inte hämta mejlet" }, { status: 500 });
  }
}
