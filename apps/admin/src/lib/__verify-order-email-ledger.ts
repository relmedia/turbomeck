/**
 * Proves the send-exactly-once guarantee against a real database.
 *
 * This is the load-bearing claim of the whole automation: if the ledger does
 * not hold, a parcel waiting at a service point mails the customer every 30
 * minutes for three days. The interesting case is CONCURRENT claims, which a
 * sequential test would never catch — so the first case fires ten claims at
 * once and asserts exactly one wins.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@*\/node_modules/tsx/dist/cli.mjs \
 *     apps/admin/src/lib/__verify-order-email-ledger.ts
 *
 * It creates and then deletes its own rows; it never sends mail.
 */

import { db } from "@repo/database";
import { orders, orderEmails } from "@repo/database/schema";
import { and, eq } from "drizzle-orm";
import {
  claimOrderEmail,
  markOrderEmailSent,
  markOrderEmailFailed,
  releaseOrderEmail,
  hasOrderEmail,
  listOrderEmails,
} from "./order-email-ledger";

const KIND = "pickup_reminder_2" as const;

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
}

async function wipe(orderId: number) {
  await db
    .delete(orderEmails)
    .where(and(eq(orderEmails.orderId, orderId), eq(orderEmails.kind, KIND)));
}

async function main() {
  const [order] = await db.select({ id: orders.id }).from(orders).limit(1);
  if (!order) {
    console.error("No orders in the database — cannot verify against a real FK.");
    process.exit(1);
  }
  const orderId = order.id;
  console.log(`Using order #${orderId}, kind "${KIND}"\n`);

  // 1. Ten concurrent claims, exactly one winner.
  await wipe(orderId);
  const results = await Promise.all(
    Array.from({ length: 10 }, () => claimOrderEmail(orderId, KIND, { test: true })),
  );
  const winners = results.filter((r) => r.claimed);
  check("10 concurrent claims -> exactly 1 winner", winners.length === 1, {
    winners: winners.length,
    losers: results.length - winners.length,
  });

  const first = winners[0];
  if (!first || !first.claimed) {
    console.error("No winner; cannot continue.");
    process.exit(1);
  }

  // 2. A fresh claim on an unconfirmed-but-recent row must NOT be handed out.
  const again = await claimOrderEmail(orderId, KIND);
  check("re-claim while in flight -> refused", !again.claimed, again);

  // 3. After confirming the send, further claims report already_sent.
  await markOrderEmailSent(first.id, "verify@example.test");
  const afterSend = await claimOrderEmail(orderId, KIND);
  check(
    "claim after send -> refused as already_sent",
    !afterSend.claimed && afterSend.reason === "already_sent",
    afterSend,
  );
  check("hasOrderEmail -> true once sent", await hasOrderEmail(orderId, KIND));

  // 4. A sent row is never reclaimable, however old the claim looks.
  await db
    .update(orderEmails)
    .set({ claimedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) })
    .where(eq(orderEmails.id, first.id));
  const staleButSent = await claimOrderEmail(orderId, KIND);
  check(
    "day-old claim that WAS sent -> still refused",
    !staleButSent.claimed && staleButSent.reason === "already_sent",
    staleButSent,
  );

  // 5. A crash mid-send (claimed, never confirmed, gone stale) must retry.
  await wipe(orderId);
  const crashed = await claimOrderEmail(orderId, KIND);
  if (!crashed.claimed) {
    check("setup for crash case", false, crashed);
  } else {
    await markOrderEmailFailed(crashed.id, new Error("SMTP connection reset"));
    const tooSoon = await claimOrderEmail(orderId, KIND);
    check("failed send, claim still fresh -> not retried yet", !tooSoon.claimed, tooSoon);

    await db
      .update(orderEmails)
      .set({ claimedAt: new Date(Date.now() - 20 * 60 * 1000) })
      .where(eq(orderEmails.id, crashed.id));
    const retried = await claimOrderEmail(orderId, KIND);
    check("failed send, claim gone stale -> retried", retried.claimed, retried);

    const rows = await listOrderEmails(orderId);
    const row = rows.find((r) => r.kind === KIND);
    check("retry reuses the same row (no duplicate)", rows.filter((r) => r.kind === KIND).length === 1);
    check("retried row is still unsent", row?.sentAt == null);
  }

  // 6. Dry-run release leaves no trace.
  await wipe(orderId);
  const dry = await claimOrderEmail(orderId, KIND);
  if (dry.claimed) await releaseOrderEmail(dry.id);
  check("release after dry-run -> row gone", !(await hasOrderEmail(orderId, KIND)));

  await wipe(orderId);
  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
