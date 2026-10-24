/**
 * PostNord Track & Trace — the typed status model.
 *
 * Why this exists: the repo used to decide whether a parcel had been delivered
 * by `JSON.stringify(response).toLowerCase()` and substring-matching a list of
 * seven keywords. That is not a near-miss, it is backwards. The poller requests
 * `locale=sv`, so the payload is Swedish, and the keyword list contained
 * "utlämning" — which is a substring of **"klar för utlämning"**, PostNord's
 * wording for *ready for collection*. Every parcel was therefore marked
 * `delivered` the moment it reached the service point, before the customer had
 * collected anything. "received" had the same defect against the early
 * "mottagen" / "received by PostNord" events, which fire when the parcel leaves
 * US.
 *
 * None of that guessing was necessary. `ItemDto.status` is a documented enum
 * (PostNord-Public-API `shipment-v2-trackandtrace` 2.0.6.3), and the item also
 * carries `deliveryDate`, `estimatedTimeOfArrival`, `returnDate` and a
 * localized `statusText`. This module reads those fields and nothing else.
 *
 * It is deliberately pure — no fetch, no database — so the mapping can be
 * tested against recorded payloads without a network.
 */

/**
 * Every value `ItemDto.status` can take.
 *
 * `AVAILABLE_FOR_DELIVERY_PAR_LOC` is the parcel-locker variant of
 * `AVAILABLE_FOR_DELIVERY`; it means the same thing to us.
 */
export const POST_NORD_ITEM_STATUSES = [
  "CREATED",
  "INFORMED",
  "EN_ROUTE",
  "AVAILABLE_FOR_DELIVERY",
  "AVAILABLE_FOR_DELIVERY_PAR_LOC",
  "DELAYED",
  "EXPECTED_DELAY",
  "DELIVERED",
  "DELIVERY_IMPOSSIBLE",
  "DELIVERY_REFUSED",
  "RETURNED",
  "STOPPED",
  "OTHER",
] as const;

export type PostNordItemStatus = (typeof POST_NORD_ITEM_STATUSES)[number];

function isPostNordItemStatus(v: unknown): v is PostNordItemStatus {
  return typeof v === "string" && (POST_NORD_ITEM_STATUSES as readonly string[]).includes(v);
}

/**
 * How far along the happy path a status sits. Used only to pick the *least*
 * advanced parcel in a multi-parcel shipment — a shipment is not delivered
 * until every parcel is. Exception states sit outside this scale and are
 * handled separately; they get -1 so they can never be mistaken for progress.
 */
const PROGRESS_RANK: Record<PostNordItemStatus, number> = {
  CREATED: 0,
  INFORMED: 1,
  EN_ROUTE: 2,
  AVAILABLE_FOR_DELIVERY: 3,
  AVAILABLE_FOR_DELIVERY_PAR_LOC: 3,
  DELIVERED: 4,
  DELAYED: -1,
  EXPECTED_DELAY: -1,
  DELIVERY_IMPOSSIBLE: -1,
  DELIVERY_REFUSED: -1,
  RETURNED: -1,
  STOPPED: -1,
  OTHER: -1,
};

/** Statuses after which polling can stop: the parcel's story is over. */
export const TERMINAL_STATUSES: readonly PostNordItemStatus[] = ["DELIVERED", "RETURNED"];

/** Statuses a human should look at. None of them move the order forward. */
export const EXCEPTION_STATUSES: readonly PostNordItemStatus[] = [
  "DELAYED",
  "EXPECTED_DELAY",
  "DELIVERY_IMPOSSIBLE",
  "DELIVERY_REFUSED",
  "STOPPED",
];

export function isTerminal(status: PostNordItemStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isException(status: PostNordItemStatus): boolean {
  return EXCEPTION_STATUSES.includes(status);
}

/** True while the parcel is sitting at the service point waiting to be fetched. */
export function isAwaitingPickup(status: PostNordItemStatus): boolean {
  return status === "AVAILABLE_FOR_DELIVERY" || status === "AVAILABLE_FOR_DELIVERY_PAR_LOC";
}

/* ------------------------------------------------------------------ *
 * Order status
 * ------------------------------------------------------------------ */

/**
 * The `orders.status` values this repo uses.
 *
 * This list was duplicated in four places that had already drifted apart —
 * the admin PATCH validator, the shipping table's labels, the shipping
 * column config, and a comment on the schema. Exported here so there is one.
 */
export const ORDER_STATUSES = [
  "confirmed",
  "deposit_paid",
  "shipped",
  "delivered",
  "returned",
  "cancelled",
  "completed",
  "partially_refunded",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * What a PostNord status means for our own order status.
 *
 * `null` means "PostNord has nothing that should move this order" — a label
 * exists but the parcel has not physically moved (`CREATED`/`INFORMED`), or the
 * status is an exception that a human has to judge. Returning null rather than
 * a status is the point: the old code could only ever write `delivered`, so
 * every signal it did not understand became delivery.
 */
export function mapToOrderStatus(status: PostNordItemStatus): OrderStatus | null {
  switch (status) {
    case "EN_ROUTE":
    case "AVAILABLE_FOR_DELIVERY":
    case "AVAILABLE_FOR_DELIVERY_PAR_LOC":
      return "shipped";
    case "DELIVERED":
      return "delivered";
    case "RETURNED":
      return "returned";
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

export type TrackingEvent = {
  time?: string;
  description?: string;
  location?: string;
  /** PostNord's own event code, kept for diagnosis. */
  eventCode?: string;
  status?: string;
};

export type ParsedTracking = {
  /** Least-advanced parcel status in the shipment, or null if PostNord gave none. */
  status: PostNordItemStatus | null;
  /** PostNord's own customer-facing wording, in the locale that was requested. */
  statusText: { header?: string; body?: string } | null;
  /** The parcel number PostNord knows, which is not always the one booking returned. */
  itemId: string | null;
  deliveryDate: string | null;
  estimatedTimeOfArrival: string | null;
  returnDate: string | null;
  events: TrackingEvent[];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

/**
 * Walks the findByIdentifier payload and pulls out everything we act on.
 *
 * The shape is tolerated loosely on purpose: v2 and v5 differ, and PostNord
 * returns singular `shipment`/`item`/`event` for one element and the plural for
 * several. Both spellings are accepted at each level, as the previous event
 * extractor already did.
 */
export function parseTrackingResponse(data: unknown): ParsedTracking {
  const empty: ParsedTracking = {
    status: null,
    statusText: null,
    itemId: null,
    deliveryDate: null,
    estimatedTimeOfArrival: null,
    returnDate: null,
    events: [],
  };

  const top = asRecord(data);
  if (!top) return empty;
  const root = asRecord(top.TrackingInformationResponse) ?? top;

  const events: TrackingEvent[] = [];
  let chosen: PostNordItemStatus | null = null;
  let chosenRank = Number.POSITIVE_INFINITY;
  let statusText: ParsedTracking["statusText"] = null;
  let itemId: string | null = null;
  let deliveryDate: string | null = null;
  let eta: string | null = null;
  let returnDate: string | null = null;

  for (const s of asArray(root.shipment ?? root.shipments)) {
    const shipment = asRecord(s);
    if (!shipment) continue;

    for (const it of asArray(shipment.item ?? shipment.items)) {
      const item = asRecord(it);
      if (!item) continue;

      itemId ??= str(item.itemId) ?? null;
      deliveryDate ??= str(item.deliveryDate) ?? null;
      eta ??= str(item.estimatedTimeOfArrival) ?? null;
      returnDate ??= str(item.returnDate) ?? null;

      const raw = item.status;
      if (isPostNordItemStatus(raw)) {
        /**
         * Take the least-advanced parcel. An exception on any parcel wins
         * outright (rank -1), so a shipment with one refused parcel is never
         * reported as delivered because the other three arrived.
         */
        const rank = PROGRESS_RANK[raw];
        if (rank < chosenRank) {
          chosenRank = rank;
          chosen = raw;
          const t = asRecord(item.statusText);
          statusText = t ? { header: str(t.header), body: str(t.body) } : null;
        }
      }

      for (const e of asArray(item.event ?? item.events)) {
        const ev = asRecord(e);
        if (!ev) continue;
        const loc = asRecord(ev.location);
        events.push({
          time: str(ev.eventTime ?? ev.timestamp ?? ev.date),
          description: str(ev.eventDescription ?? ev.description ?? ev.status),
          location: loc ? str(loc.city ?? loc.name ?? loc.address) : undefined,
          eventCode: str(ev.eventCode),
          status: str(ev.status),
        });
      }
    }
  }

  events.sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""));

  return {
    status: chosen,
    statusText,
    itemId,
    deliveryDate,
    estimatedTimeOfArrival: eta,
    returnDate,
    events,
  };
}

/**
 * Chronological event list, newest first.
 *
 * Kept as a named export because three call sites used to each carry their own
 * copy of this function: the storefront tracking panel, the admin order page,
 * and the poller's ancestor.
 */
export function extractTrackingEvents(data: unknown): TrackingEvent[] {
  return parseTrackingResponse(data).events;
}
