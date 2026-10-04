ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "specifications" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
