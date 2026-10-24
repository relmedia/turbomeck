-- Records where an order came from, so a staff-created order is never mistaken
-- for a paid one.
--
-- Admin can now create an order by hand (no checkout, no Stripe PaymentIntent).
-- Those orders have `stripe_payment_id` NULL, which until now was also true of
-- genuine zero-total orders — leaving no way to tell a test order from real
-- revenue, or to stop one being offered as refundable.
--
-- Defaults to 'storefront' so every existing row keeps its current meaning;
-- backfill is implicit.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "created_via" text DEFAULT 'storefront' NOT NULL;--> statement-breakpoint

COMMENT ON COLUMN "orders"."created_via" IS 'Origin of the order: ''storefront'' for a real checkout, ''admin'' for one created by staff in the admin UI (no payment taken).';
