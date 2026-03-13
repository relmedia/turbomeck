CREATE TABLE "page_visits" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_type" text NOT NULL,
	"path" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
