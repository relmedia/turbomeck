CREATE TABLE "discount_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"discount_type" text NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"min_order_amount" numeric(12, 2),
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp,
	"valid_until" timestamp,
	"active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "password_reset_token" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;