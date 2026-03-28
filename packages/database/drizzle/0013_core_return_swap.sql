ALTER TABLE "products" DROP COLUMN IF EXISTS "deposit_amount";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "commits_core_return_within_14" boolean;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "core_keep_fee_sek" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "core_return_deadline" timestamp;
