CREATE TABLE IF NOT EXISTS "checkout_intent" (
	"payment_intent_id" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"quoted_charge_sek" integer NOT NULL,
	"order_id" integer,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checkout_intent" ADD CONSTRAINT "checkout_intent_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_intent_unconsumed_idx" ON "checkout_intent" ("created_at") WHERE "consumed_at" IS NULL;
