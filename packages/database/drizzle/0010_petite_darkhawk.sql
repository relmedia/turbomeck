ALTER TABLE "orders" ADD COLUMN "deposit_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "balance_due" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_balance_payment_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "core_received_at" timestamp;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "deposit_amount" numeric(10, 2);