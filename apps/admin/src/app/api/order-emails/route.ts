import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { listAllOrderEmails } from "@/lib/order-email-ledger";
import { orderEmailLabel, orderEmailOrigin, orderEmailState } from "@/lib/order-email-state";

/**
 * Every recorded order email, newest first — the E-postlogg page.
 *
 * The derived state is computed HERE rather than in the component, so the one
 * implementation in `order-email-ledger.ts` is the only thing that decides
 * whether a row counts as sent. The distinction matters more than it looks:
 * a superseded row carries a `sentAt` and was never emailed, and a client that
 * re-derived state from the raw fields would quietly get that wrong.
 *
 * Read-only by design. Resending already exists on the order page, behind the
 * ledger's claim; offering it from a log would mail a real customer from a
 * screen meant for reading.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const rows = await listAllOrderEmails();

    return NextResponse.json({
      emails: rows.map((r) => ({
        /** String, because the shared DataTable is generic over `{ id: string }`. */
        id: String(r.id),
        orderId: r.orderId,
        orderNumber: r.orderNumber,
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        kind: r.kind,
        label: orderEmailLabel(r.kind),
        /**
         * Derived server-side with one clock. `sending` vs `stale` is
         * time-dependent, and a workstation twenty minutes off would relabel
         * a healthy send as stuck.
         */
        state: orderEmailState(r),
        origin: orderEmailOrigin(r.meta),
        claimedAt: r.claimedAt.toISOString(),
        sentAt: r.sentAt ? r.sentAt.toISOString() : null,
        /** What the row is about in time, matching the server's sort. */
        at: (r.sentAt ?? r.claimedAt).toISOString(),
        recipient: r.recipient,
        error: r.error,
        /**
         * Only the one field the table shows. The rest of `meta` is internal
         * (tracking ids, claim reasons) and has no place in an admin list.
         */
        observedStatus:
          typeof r.meta?.observedStatus === "string" ? r.meta.observedStatus : null,
      })),
    });
  } catch (err) {
    console.error("[order-emails]", err);
    return NextResponse.json({ error: "Kunde inte hämta utskicksloggen" }, { status: 500 });
  }
}
