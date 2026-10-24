-- Real shipping status, and a ledger that makes automated mail send exactly once.
--
-- Why the columns: the only automated shipping logic in the app decided a
-- parcel had been delivered by running JSON.stringify() over PostNord's whole
-- response and substring-matching seven keywords. It polls with locale=sv, and
-- one of those keywords was "utlämning" — a substring of PostNord's own
-- "Försändelsen har kommit till mottagarens utlämningsställe", which means the
-- parcel has ARRIVED at the pickup point, not that anyone collected it. Orders
-- were therefore flipped to delivered days early. PostNord publishes a typed
-- status enum on item.status (shipment-v2-trackandtrace 2.0.6.3); these columns
-- store that instead of guessing, plus the timestamps the app never recorded.
--
-- Why the table: the poller re-reads every open parcel on each run. Without a
-- send-record, a parcel waiting at a service point would re-mail the customer
-- on every tick. The UNIQUE (order_id, kind) index is the actual guarantee —
-- senders claim a row before sending and only send if the insert won.
-- sent_at stays NULL until the transport confirms, so a crash mid-send leaves a
-- retryable claim rather than a false record of having told the customer.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "post_nord_status" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "post_nord_status_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "post_nord_last_polled_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "post_nord_delivered_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "post_nord_available_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "post_nord_eta" timestamp;--> statement-breakpoint

COMMENT ON COLUMN "orders"."post_nord_status" IS 'PostNord ItemDto.status verbatim (EN_ROUTE, AVAILABLE_FOR_DELIVERY, DELIVERED, ...). Kept unmapped so a mapping change needs no backfill.';--> statement-breakpoint
COMMENT ON COLUMN "orders"."post_nord_available_at" IS 'When the parcel became collectable at the service point. Drives the pickup reminders; PostNord returns uncollected parcels after 3 days (cut from 7 on 2026-10-01).';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "order_emails" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL,
  "kind" text NOT NULL,
  "claimed_at" timestamp DEFAULT now() NOT NULL,
  "sent_at" timestamp,
  "recipient" text,
  "error" text,
  "meta" jsonb
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "order_emails" ADD CONSTRAINT "order_emails_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "order_emails_order_kind_unique" ON "order_emails" ("order_id","kind");--> statement-breakpoint

COMMENT ON TABLE "order_emails" IS 'One row per (order, email kind). The unique index is what makes automated mail send exactly once; claim the row, then send only if the insert won.';--> statement-breakpoint

-- Backfill: orders already marked shipped/delivered have had their dispatch
-- mail sent by hand, and must not receive it again the first time the new
-- poller sees them. Claim those rows as already sent, dated from the order so
-- the ledger does not claim we mailed everyone today.
INSERT INTO "order_emails" ("order_id", "kind", "claimed_at", "sent_at", "meta")
SELECT "id", 'shipment_dispatched', COALESCE("created_at", now()), COALESCE("created_at", now()),
       jsonb_build_object('backfilled', true, 'reason', 'status already shipped/delivered at migration 0025')
FROM "orders"
WHERE "status" IN ('shipped', 'delivered', 'completed')
  AND "post_nord_tracking_id" IS NOT NULL
ON CONFLICT DO NOTHING;
