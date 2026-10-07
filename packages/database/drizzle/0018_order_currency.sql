ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'SEK' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fx_rate_from_sek" numeric(12, 6);--> statement-breakpoint
COMMENT ON COLUMN "orders"."currency" IS 'ISO code the customer was actually charged in (SEK base, NOK for Norwegian deliveries).';--> statement-breakpoint
COMMENT ON COLUMN "orders"."fx_rate_from_sek" IS 'SEK->currency rate used at checkout. NULL or 1 for SEK orders. Kept so a sale can be reconciled against the rate that priced it.';
