ALTER TABLE "order_items" ADD COLUMN "variant" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "attributes" jsonb DEFAULT '[]'::jsonb;