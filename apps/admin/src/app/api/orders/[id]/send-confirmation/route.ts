import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { sendOrderNotification } from "@/lib/trigger-order-notification";
import {
  claimOrderEmail,
  markOrderEmailSent,
  markOrderEmailFailed,
} from "@/lib/order-email-ledger";

/**
 * Send the "tack för ditt köp" confirmation for an existing order.
 *
 * Exists because orders created in admin never send one: persistOrder returns
 * before the mail when `origin === "admin"`. The shop knows about such an
 * order, but the customer does not, and for a phone or counter sale they are
 * the one who needs the receipt.
 *
 * Claimed in the ledger like every other automated mail, so the Utskick list
 * shows whether the customer was told and when. `force` is accepted because
 * this is only ever reached by a human pressing a button — the guard exists to
 * stop accidental repeats, not deliberate ones.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (!Number.isFinite(orderId) || orderId < 1) {
    return NextResponse.json({ error: "Ogiltigt order-ID" }, { status: 400 });
  }

  const force = new URL(req.url).searchParams.get("force") === "true";

  const claim = await claimOrderEmail(orderId, "order_confirmation", { source: "manual" });
  if (!claim.claimed && !force) {
    return NextResponse.json(
      { error: "Orderbekräftelsen har redan skickats. Skicka igen för att tvinga." , alreadySent: true },
      { status: 409 },
    );
  }
  const claimId = claim.claimed ? claim.id : null;

  try {
    const sent = await sendOrderNotification(orderId, "order_confirmation");
    if (!sent.sent) throw new Error(sent.skipped ?? "Mejlet skickades inte");
    if (claimId != null) await markOrderEmailSent(claimId, sent.recipient ?? null);
    return NextResponse.json({ success: true, recipient: sent.recipient });
  } catch (err) {
    if (claimId != null) await markOrderEmailFailed(claimId, err);
    const message = err instanceof Error ? err.message : String(err);
    console.error("[send-confirmation] failed:", err);
    return NextResponse.json({ error: "Kunde inte skicka orderbekräftelsen", details: message }, { status: 502 });
  }
}
