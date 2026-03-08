ALTER TABLE "products" ADD COLUMN "name_en" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "short_description_en" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description_en" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "edited_at" timestamp;