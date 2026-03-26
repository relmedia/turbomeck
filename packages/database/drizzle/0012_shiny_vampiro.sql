ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "view_token" text;--> statement-breakpoint
-- Built-in gen_random_uuid() (PG 13+) — avoids requiring pgcrypto for gen_random_bytes()
UPDATE "orders" SET "view_token" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') WHERE "view_token" IS NULL;