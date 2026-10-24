/**
 * Asserts the PostNord status mapping, including the regression that motivated
 * the whole rewrite.
 *
 * Pure — no network, no database. The payload shapes are taken from a real
 * `findByIdentifier.json` response for parcel 00573132902028050319 (captured
 * 2026-10-24), so the field paths are the ones PostNord actually returns, not
 * the ones the spec implies.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@*\/node_modules/tsx/dist/cli.mjs \
 *     packages/shipping/src/__verify-postnord-status.ts
 */

import {
  parseTrackingResponse,
  mapToOrderStatus,
  isAwaitingPickup,
  isTerminal,
  isException,
} from "./postnord-status";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
}

/** Shape copied from the live response. */
function payload(
  status: string,
  eventDescription: string,
  extra: Record<string, unknown> = {},
) {
  return {
    TrackingInformationResponse: {
      shipments: [
        {
          shipmentId: "00573132902028050319",
          items: [
            {
              itemId: "00573132902028050319",
              status,
              statusText: { header: "…", body: eventDescription },
              events: [
                { eventTime: "2026-10-24T13:51:36", status, eventCode: "68", eventDescription },
              ],
              ...extra,
            },
          ],
        },
      ],
    },
  };
}

console.log("— THE REGRESSION —");
/**
 * This is what the old code got wrong. PostNord's Swedish wording when a parcel
 * reaches the pickup point is "Försändelsen har kommit till mottagarens
 * utlämningsställe". The old check was
 * `JSON.stringify(data).toLowerCase().includes("utlämning")`, and
 * "utlämningsställe" contains "utlämning" — so this payload set the order to
 * `delivered` while the parcel was still sitting on a shelf.
 */
const atPickupPoint = payload(
  "AVAILABLE_FOR_DELIVERY",
  "Försändelsen har kommit till mottagarens utlämningsställe",
);

const OLD_KEYWORDS = ["delivered", "levererad", "utlämnad", "utlämning", "avhämtat", "received", "received by recipient"];
const oldVerdict = OLD_KEYWORDS.some((k) => JSON.stringify(atPickupPoint).toLowerCase().includes(k));
check("old keyword logic DID call this delivered (the bug)", oldVerdict === true, {
  matched: OLD_KEYWORDS.filter((k) => JSON.stringify(atPickupPoint).toLowerCase().includes(k)),
});

const parsedPickup = parseTrackingResponse(atPickupPoint);
check("new: status parsed as AVAILABLE_FOR_DELIVERY", parsedPickup.status === "AVAILABLE_FOR_DELIVERY", parsedPickup.status);
check("new: maps to 'shipped', NOT 'delivered'", mapToOrderStatus("AVAILABLE_FOR_DELIVERY") === "shipped");
check("new: recognised as awaiting pickup", isAwaitingPickup("AVAILABLE_FOR_DELIVERY"));
check("new: NOT terminal (still needs polling)", !isTerminal("AVAILABLE_FOR_DELIVERY"));

console.log("\n— the other false positive —");
/** "mottagen" / "received by PostNord" fires when the parcel leaves US. */
const justCollected = payload("INFORMED", "Försändelsen är mottagen av PostNord - received by PostNord");
const oldVerdict2 = OLD_KEYWORDS.some((k) => JSON.stringify(justCollected).toLowerCase().includes(k));
check("old keyword logic DID call a just-collected parcel delivered", oldVerdict2 === true);
check("new: INFORMED maps to nothing", mapToOrderStatus("INFORMED") === null);

console.log("\n— the happy path —");
const enRoute = payload("EN_ROUTE", "Försändelsen är under transport");
check("EN_ROUTE parses", parseTrackingResponse(enRoute).status === "EN_ROUTE");
check("EN_ROUTE -> shipped", mapToOrderStatus("EN_ROUTE") === "shipped");

const delivered = payload("DELIVERED", "Försändelsen är utlämnad", { deliveryDate: "2026-10-28T09:12:00" });
const pd = parseTrackingResponse(delivered);
check("DELIVERED parses", pd.status === "DELIVERED");
check("DELIVERED -> delivered", mapToOrderStatus("DELIVERED") === "delivered");
check("deliveryDate captured", pd.deliveryDate === "2026-10-28T09:12:00", pd.deliveryDate);
check("DELIVERED is terminal", isTerminal("DELIVERED"));

const returned = payload("RETURNED", "Försändelsen returneras till avsändaren");
check("RETURNED -> returned", mapToOrderStatus("RETURNED") === "returned");
check("RETURNED is terminal", isTerminal("RETURNED"));

console.log("\n— exceptions never move the order —");
for (const s of ["DELAYED", "EXPECTED_DELAY", "DELIVERY_IMPOSSIBLE", "DELIVERY_REFUSED", "STOPPED"] as const) {
  check(`${s} is an exception and maps to null`, isException(s) && mapToOrderStatus(s) === null);
}

console.log("\n— multi-parcel: least advanced wins —");
/** A shipment is not delivered because three of four parcels arrived. */
const mixed = {
  TrackingInformationResponse: {
    shipments: [
      {
        items: [
          { itemId: "a", status: "DELIVERED", events: [] },
          { itemId: "b", status: "EN_ROUTE", events: [] },
        ],
      },
    ],
  },
};
check("one delivered + one en route -> EN_ROUTE", parseTrackingResponse(mixed).status === "EN_ROUTE", parseTrackingResponse(mixed).status);

const withException = {
  TrackingInformationResponse: {
    shipments: [{ items: [{ itemId: "a", status: "DELIVERED", events: [] }, { itemId: "b", status: "DELIVERY_REFUSED", events: [] }] }],
  },
};
check(
  "one delivered + one refused -> the exception wins",
  parseTrackingResponse(withException).status === "DELIVERY_REFUSED",
  parseTrackingResponse(withException).status,
);

console.log("\n— shape tolerance —");
check("singular shipment/item/event keys work", parseTrackingResponse({
  TrackingInformationResponse: { shipment: { item: { itemId: "x", status: "EN_ROUTE", event: { eventTime: "t", eventDescription: "d" } } } },
}).status === "EN_ROUTE");
check("no TrackingInformationResponse wrapper works", parseTrackingResponse({
  shipments: [{ items: [{ itemId: "x", status: "DELIVERED" }] }],
}).status === "DELIVERED");
check("garbage in -> null, no throw", parseTrackingResponse({ nonsense: true }).status === null);
check("null in -> null, no throw", parseTrackingResponse(null).status === null);
check("unknown status string -> null (not guessed)", parseTrackingResponse(payload("SOMETHING_NEW", "x")).status === null);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
