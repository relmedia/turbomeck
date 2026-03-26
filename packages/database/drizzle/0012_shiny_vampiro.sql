ALTER TABLE "orders" ADD COLUMN "view_token" text;--> statement-breakpoint
UPDATE "orders" SET "view_token" = encode(gen_random_bytes(32), 'hex') WHERE "view_token" IS NULL;