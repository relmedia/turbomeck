-- Stripe refunds issued from the admin.
--
-- A table rather than columns on `orders`: Stripe permits several partial
-- refunds against one charge, so a single amount column could not represent
-- what actually happened.
--
-- These rows are NOT the source of truth for what is still refundable. That is
-- read live from Stripe on every quote, because a refund issued from the Stripe
-- dashboard never reaches us — apps/client/src/app/api/stripe/webhook only
-- handles payment_intent.{succeeded,payment_failed,canceled} and 200-acks the
-- rest. These rows exist to reserve, to audit, and to show history.
CREATE TABLE IF NOT EXISTS "order_refunds" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "stripe_payment_intent_id" text NOT NULL,
  "stripe_charge_id" text,
  "charge_kind" text NOT NULL,
  "stripe_refund_id" text,
  "amount" numeric(12, 2) NOT NULL,
  "currency" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "note" text,
  "stripe_failure_reason" text,
  "idempotency_key" text NOT NULL,
  "performed_by" text,
  "email_sent_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- The reservation guard. A refund row is written as 'pending' under this key
-- BEFORE Stripe is called, with ON CONFLICT DO NOTHING; a retry carrying the
-- same key therefore finds the existing reservation instead of issuing a second
-- refund. Same shape as orders_stripe_payment_id_unique, and for the same
-- reason: a check-then-insert in application code is one two concurrent writers
-- both pass.
CREATE UNIQUE INDEX IF NOT EXISTS "order_refunds_idempotency_key_unique"
  ON "order_refunds" ("idempotency_key");--> statement-breakpoint

COMMENT ON INDEX "order_refunds_idempotency_key_unique" IS 'Reservation key, written before the Stripe call. The admin UI mints one UUID per confirm-dialog open, so a double-click, a retried fetch and a reload-and-retry all collapse onto one refund.';--> statement-breakpoint

-- Second line of defence, after Stripe has answered. Deliberately not partial:
-- the column is NULL until Stripe returns an id, and Postgres treats NULLs as
-- distinct, so any number of pending rows coexist here.
CREATE UNIQUE INDEX IF NOT EXISTS "order_refunds_stripe_refund_id_unique"
  ON "order_refunds" ("stripe_refund_id");--> statement-breakpoint

COMMENT ON INDEX "order_refunds_stripe_refund_id_unique" IS 'One row per Stripe refund. NULL while pending; Postgres treats NULLs as distinct so pending rows do not collide.';--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "order_refunds_order_id_idx"
  ON "order_refunds" ("order_id");--> statement-breakpoint

COMMENT ON COLUMN "order_refunds"."amount" IS 'Major units in the CHARGE currency, matching orders.total. Never assume SEK.';--> statement-breakpoint
COMMENT ON COLUMN "order_refunds"."charge_kind" IS 'Which payment slot of the order this hit: full | deposit | balance.';--> statement-breakpoint
COMMENT ON COLUMN "order_refunds"."performed_by" IS 'Admin email or id. Any admin may refund, so this plus the server log is the whole audit trail.';
