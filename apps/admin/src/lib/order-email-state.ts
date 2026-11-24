/**
 * What the order-email ledger means, with no database attached.
 *
 * Split from `order-email-ledger.ts` for a hard reason, not tidiness: that
 * module imports `db` from `@repo/database`, which opens a postgres client at
 * module load. A `"use client"` page importing a label map from it would drag
 * drizzle and `pg` into the browser bundle. The kinds, the labels and the
 * state derivation are all needed on both sides of the JSON boundary, so they
 * live here and the ledger re-exports them — one definition, no second copy.
 *
 * Same shape as `email-template-keys.ts`: a registry plus the functions that
 * read it.
 */

/**
 * Every automated mail this system can send.
 *
 * Adding one needs no migration — `kind` is free text in the table — but it
 * must be listed here so the dry-run report, the admin "Utskick" list and the
 * E-postlogg can name it.
 */
export const ORDER_EMAIL_KINDS = [
  /**
   * The "tack för ditt köp" mail. Sent automatically at checkout, but NOT for
   * orders staff create in admin — persistOrder suppresses it there. Recording
   * it here means a manual send is tracked like any other, and the Utskick
   * list shows whether the customer was ever told.
   */
  "order_confirmation",
  "shipment_dispatched",
  "ready_for_pickup",
  "pickup_reminder_1",
  "pickup_reminder_2",
  "order_delivered",
  "core_return_reminder",
  "core_return_overdue",
] as const;

export type OrderEmailKind = (typeof ORDER_EMAIL_KINDS)[number];

/**
 * How long a claim may sit unconfirmed before another run may take it.
 *
 * Long enough that a slow SMTP handshake is never treated as a crash; short
 * enough that a genuine crash retries within one poll cycle. Shared with the
 * UI so "still sending" and the ledger's own retry window cannot drift apart.
 */
export const RECLAIM_AFTER_MS = 15 * 60 * 1000;

/**
 * Swedish names for the ledger kinds.
 *
 * An unknown kind falls back to its raw value rather than vanishing: a mail
 * that went out should always be visible, including one added after this map
 * was written.
 */
export const ORDER_EMAIL_LABELS: Record<string, string> = {
  order_confirmation: "Orderbekräftelse",
  shipment_dispatched: "Skickad + spårlänk",
  ready_for_pickup: "Klar att hämta",
  pickup_reminder_1: "Påminnelse 1",
  pickup_reminder_2: "Påminnelse 2",
  order_delivered: "Levererad",
  core_return_reminder: "Kärnretur — påminnelse",
  core_return_overdue: "Kärnretur — försenad (till er)",
};

/** Label for a stored kind, falling back to the raw value. */
export function orderEmailLabel(kind: string): string {
  return ORDER_EMAIL_LABELS[kind] ?? kind;
}

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

/**
 * What a ledger row actually means.
 *
 * There is no status column — state is derived — and two of these exist
 * because `sentAt` ALONE IS NOT ENOUGH to say a customer was emailed:
 *
 *  - `superseded`: the poller marks a reminder handled when the parcel has
 *    already moved past that stage, so it can never fire late. It sets
 *    `sentAt`, passes a null recipient, and sends nothing (the supersede loop
 *    in `sync-shipping-status.ts`). Production holds two such rows right now.
 *  - `backfilled`: migration 0025 invented `shipment_dispatched` rows for
 *    orders already shipped, stamped with the order's own created_at. No mail
 *    was sent for those either.
 *
 * Reporting either as sent would tell staff a customer had been contacted when
 * they had not — the one mistake a page like this must not make. A null
 * recipient is deliberately NOT the test: genuine sends can have one too, as
 * the manually-triggered `shipment_dispatched` row in production does.
 */
export type OrderEmailState =
  /** Handed to SMTP and accepted. NOT a delivery confirmation. */
  | "sent"
  /** Marked handled so it cannot fire later; nothing was emailed. */
  | "superseded"
  /** Invented by migration 0025 for already-shipped orders. */
  | "backfilled"
  /** The transport threw. Retried once the claim ages out. */
  | "failed"
  /** Claimed and probably in flight. */
  | "sending"
  /** Claimed but never confirmed — a crash. Re-claimable now. */
  | "stale";

export type OrderEmailStateInput = {
  /** `Date` from drizzle, ISO string after JSON. Both accepted. */
  sentAt: Date | string | null;
  error: string | null;
  claimedAt: Date | string;
  meta?: Record<string, unknown> | null;
};

const asTime = (v: Date | string): number =>
  v instanceof Date ? v.getTime() : new Date(v).getTime();

/** `meta` holds `unknown` values, so compare to true rather than coercing. */
const flag = (meta: Record<string, unknown> | null | undefined, key: string): boolean =>
  typeof meta === "object" && meta !== null && meta[key] === true;

/**
 * The one place a row becomes a state.
 *
 * Shared by the E-postlogg and the per-order "Utskick" list so the two can
 * never disagree about the same row.
 *
 * The two never-actually-sent states are checked FIRST, because both carry a
 * `sentAt` and would otherwise read as ordinary sends.
 */
export function orderEmailState(row: OrderEmailStateInput, now = Date.now()): OrderEmailState {
  if (flag(row.meta, "superseded")) return "superseded";
  if (flag(row.meta, "backfilled")) return "backfilled";
  if (row.sentAt) return "sent";
  if (row.error) return "failed";
  return asTime(row.claimedAt) > now - RECLAIM_AFTER_MS ? "sending" : "stale";
}

/**
 * How each state is presented.
 *
 * "Skickad", never "Levererad": `sentAt` records that our mail server accepted
 * the message, and nothing here ingests bounces, so delivery is not a claim the
 * data can support. The two never-sent states get no green and never the word
 * "skickad" — that is the regression this page exists to avoid.
 */
export const ORDER_EMAIL_STATE_META: Record<
  OrderEmailState,
  { label: string; hint: string; className: string; dotClassName: string }
> = {
  sent: {
    label: "Skickad",
    hint: "Mejlservern tog emot utskicket. Det är inte ett leveranskvitto — vi ser inte om det nådde inkorgen.",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotClassName: "bg-emerald-500",
  },
  superseded: {
    label: "Behövdes inte",
    hint: "Paketet hade redan gått vidare när utskicket skulle gå ut, så det bockades av utan att något mejl skickades. Kunden har inte fått det här mejlet.",
    className: "bg-slate-50 text-slate-600 border-slate-200",
    dotClassName: "bg-slate-400",
  },
  backfilled: {
    label: "Före loggen",
    hint: "Lades in när loggen skapades, för ordrar som redan var skickade. Tidpunkten är orderns datum, inte en verklig sändning.",
    className: "bg-slate-50 text-slate-600 border-slate-200",
    dotClassName: "bg-slate-400",
  },
  failed: {
    label: "Misslyckades",
    hint: "Mejlservern nekade utskicket. Det görs om automatiskt vid nästa körning.",
    className: "bg-red-50 text-red-700 border-red-200",
    dotClassName: "bg-destructive",
  },
  sending: {
    label: "Skickas…",
    hint: "Påbörjat men ännu inte bekräftat.",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    dotClassName: "bg-amber-500",
  },
  stale: {
    label: "Avbröts — görs om",
    hint: "Ingen bekräftelse på över 15 minuter. Nästa körning tar om utskicket.",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    dotClassName: "bg-amber-500",
  },
};

/** Where the row came from, read off the `meta` shapes this repo writes. */
export function orderEmailOrigin(
  meta: Record<string, unknown> | null | undefined,
): "manual" | "backfill" | "test" | "auto" {
  if (typeof meta === "object" && meta !== null && meta.source === "manual") return "manual";
  if (flag(meta, "backfilled")) return "backfill";
  if (flag(meta, "test")) return "test";
  return "auto";
}

export const ORDER_EMAIL_ORIGIN_LABELS: Record<string, string> = {
  auto: "Automatik",
  manual: "Manuellt",
  backfill: "Import",
  test: "Test",
};
