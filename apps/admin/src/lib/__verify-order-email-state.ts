/**
 * Checks that a ledger row is read as what it actually means.
 *
 * The failure this exists to prevent is specific and live. Two rows in
 * production (`pickup_reminder_1` and `pickup_reminder_2` on order 29) have a
 * `sent_at` timestamp and were NEVER EMAILED — the shipping poller bocks a
 * reminder off when the parcel has already moved past that stage, writing
 * `markOrderEmailSent(claim.id, null)` without sending anything. Migration
 * 0025 did the same for already-shipped orders.
 *
 * So any code that reads `sent_at` as "the customer was told" is wrong about
 * real data. That is the one mistake an email log must not make, and this
 * harness is where it is held down.
 *
 * Pure — no database, no SMTP, no network. Imports only `order-email-state.ts`.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     apps/admin/src/lib/__verify-order-email-state.ts
 */

import {
  ORDER_EMAIL_KINDS,
  ORDER_EMAIL_LABELS,
  ORDER_EMAIL_ORIGIN_LABELS,
  ORDER_EMAIL_STATE_META,
  RECLAIM_AFTER_MS,
  orderEmailLabel,
  orderEmailOrigin,
  orderEmailState,
  type OrderEmailState,
} from "./order-email-state";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

/** Frozen clock, so the in-flight/stale boundary is not a race. */
const NOW = new Date("2026-11-24T18:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms);
const SENT = new Date("2026-11-24T17:00:02Z");

/* ---- the two rows that look sent and are not ------------------------- */
{
  /** Shaped exactly like production's pickup_reminder_1. */
  const superseded = orderEmailState(
    {
      sentAt: SENT,
      error: null,
      claimedAt: SENT,
      meta: { superseded: true, observedStatus: "DELIVERED" },
    },
    NOW,
  );
  check("a superseded row is NOT reported as sent", superseded === "superseded", superseded);

  const backfilled = orderEmailState(
    {
      sentAt: SENT,
      error: null,
      claimedAt: SENT,
      meta: { backfilled: true, reason: "status already shipped/delivered at migration 0025" },
    },
    NOW,
  );
  check("a backfilled row is NOT reported as sent", backfilled === "backfilled", backfilled);
}

/* ---- and the ones that really are sent -------------------------------- */
{
  /** Production's ready_for_pickup. */
  const real = orderEmailState(
    {
      sentAt: SENT,
      error: null,
      claimedAt: SENT,
      meta: { reason: "AVAILABLE_FOR_DELIVERY", trackingId: "0057…", observedStatus: "AVAILABLE_FOR_DELIVERY" },
    },
    NOW,
  );
  check("a genuine send is sent", real === "sent", real);

  /**
   * Production's manually-triggered shipment_dispatched row has an empty
   * recipient. A null recipient must therefore NEVER be used to mean "not
   * emailed" — only `meta.superseded` can.
   */
  const nullRecipient = orderEmailState(
    { sentAt: SENT, error: null, claimedAt: SENT, meta: { source: "manual" } },
    NOW,
  );
  check("a sent row with no recorded recipient is still sent", nullRecipient === "sent", nullRecipient);

  check(
    "no meta at all is still sent",
    orderEmailState({ sentAt: SENT, error: null, claimedAt: SENT, meta: null }, NOW) === "sent",
  );
}

/* ---- unsent rows ------------------------------------------------------ */
{
  check(
    "an error with no sentAt is failed",
    orderEmailState(
      { sentAt: null, error: "connect ECONNREFUSED", claimedAt: ago(0), meta: null },
      NOW,
    ) === "failed",
  );
  check(
    "a fresh claim is in flight",
    orderEmailState({ sentAt: null, error: null, claimedAt: ago(60_000), meta: null }, NOW) ===
      "sending",
  );
  check(
    "an abandoned claim is stale",
    orderEmailState({ sentAt: null, error: null, claimedAt: ago(30 * 60_000), meta: null }, NOW) ===
      "stale",
  );

  /**
   * The boundary is the ledger's own retry window. If these two ever disagree,
   * the page says "still sending" about a mail the poller has already retried.
   */
  check(
    "the in-flight window is exactly RECLAIM_AFTER_MS",
    orderEmailState(
      { sentAt: null, error: null, claimedAt: ago(RECLAIM_AFTER_MS - 1000), meta: null },
      NOW,
    ) === "sending" &&
      orderEmailState(
        { sentAt: null, error: null, claimedAt: ago(RECLAIM_AFTER_MS + 1000), meta: null },
        NOW,
      ) === "stale",
    RECLAIM_AFTER_MS,
  );
}

/* ---- the JSON boundary ------------------------------------------------ */
{
  /** The log page receives ISO strings; the order page receives Dates. */
  const asDate = orderEmailState(
    { sentAt: null, error: null, claimedAt: ago(30 * 60_000), meta: null },
    NOW,
  );
  const asIso = orderEmailState(
    { sentAt: null, error: null, claimedAt: ago(30 * 60_000).toISOString(), meta: null },
    NOW,
  );
  check("an ISO string reads the same as a Date", asDate === asIso, { asDate, asIso });
}

/* ---- meta is untrusted jsonb ------------------------------------------ */
{
  check(
    "a truthy-but-not-true superseded value is ignored",
    orderEmailState(
      { sentAt: SENT, error: null, claimedAt: SENT, meta: { superseded: "nope" } },
      NOW,
    ) === "sent",
  );
  check(
    "undefined meta does not throw",
    orderEmailState({ sentAt: null, error: null, claimedAt: ago(0) }, NOW) === "sending",
  );
}

/* ---- labels and presentation ------------------------------------------ */
{
  const missing = ORDER_EMAIL_KINDS.filter((k) => !ORDER_EMAIL_LABELS[k]);
  check("every kind has a Swedish label", missing.length === 0, missing);
  check(
    "an unknown kind falls back to its raw value",
    orderEmailLabel("some_future_mail") === "some_future_mail",
  );

  const states: OrderEmailState[] = [
    "sent",
    "superseded",
    "backfilled",
    "failed",
    "sending",
    "stale",
  ];
  check(
    "every state has a label and an explanation",
    states.every((s) => ORDER_EMAIL_STATE_META[s]?.label && ORDER_EMAIL_STATE_META[s]?.hint),
  );

  /**
   * Guards the copy against a well-meaning future edit. `sent_at` is an
   * SMTP-accept timestamp and nothing here ingests bounces, so claiming
   * delivery would be stating something the data cannot support.
   */
  const sentCopy = `${ORDER_EMAIL_STATE_META.sent.label} ${ORDER_EMAIL_STATE_META.sent.hint}`;
  check(
    "the sent state never claims delivery",
    !/levererad|kommit fram|mottagen/i.test(sentCopy),
    sentCopy,
  );
  /** And the two never-sent states must not borrow the word either. */
  check(
    "a never-sent state is never labelled skickad",
    !/skickad/i.test(ORDER_EMAIL_STATE_META.superseded.label) &&
      !/skickad/i.test(ORDER_EMAIL_STATE_META.backfilled.label),
    [ORDER_EMAIL_STATE_META.superseded.label, ORDER_EMAIL_STATE_META.backfilled.label],
  );
  check(
    "and is not coloured like a send",
    !ORDER_EMAIL_STATE_META.superseded.className.includes("emerald") &&
      !ORDER_EMAIL_STATE_META.backfilled.className.includes("emerald"),
  );
}

/* ---- origin, read off the meta shapes this repo writes ---------------- */
{
  check("manual sends are attributed", orderEmailOrigin({ source: "manual" }) === "manual");
  check("backfilled rows are attributed", orderEmailOrigin({ backfilled: true }) === "backfill");
  check("harness rows are attributed", orderEmailOrigin({ test: true }) === "test");
  check(
    "a poller send is automatic",
    orderEmailOrigin({ trackingId: "x", observedStatus: "DELIVERED" }) === "auto",
  );
  check("no meta is automatic", orderEmailOrigin(null) === "auto");
  check(
    "every origin has a label",
    ["auto", "manual", "backfill", "test"].every((o) => !!ORDER_EMAIL_ORIGIN_LABELS[o]),
  );
}

/* ---- what the archive link may and may not be offered for ------------- */
{
  /**
   * The log only offers "Visa" when a stored copy exists. These assert the
   * rule the UI depends on: a row the poller ticked off without sending has
   * nothing to show, and must never be presented as a viewable mail.
   */
  const neverSent: OrderEmailState[] = ["superseded", "backfilled"];
  check(
    "the never-sent states are exactly the ones with no mail to show",
    neverSent.every((s) => ORDER_EMAIL_STATE_META[s].hint.match(/inte|inget/i)),
    neverSent.map((s) => ORDER_EMAIL_STATE_META[s].hint),
  );

  /**
   * An archived copy is only meaningful for a row that actually sent, so the
   * sent state must remain the only green one — the link sits beside it.
   */
  const greens = (
    ["sent", "superseded", "backfilled", "failed", "sending", "stale"] as OrderEmailState[]
  ).filter((s) => ORDER_EMAIL_STATE_META[s].className.includes("emerald"));
  check("exactly one state is presented as a success", greens.length === 1 && greens[0] === "sent", greens);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
