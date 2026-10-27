-- Visually-built email templates from the Unlayer editor.
--
-- Its own table rather than another app_settings key: a design is a full
-- document — the editor's JSON plus the compiled HTML — tens of kilobytes
-- each, and several in one TEXT value would mean rewriting every template to
-- save one of them.
--
-- Both representations are stored on purpose. `design` is Unlayer's own
-- format and the only thing it can re-open for editing; `html` is what is
-- actually emailed. Unlayer cannot parse HTML back into blocks, so dropping
-- the design would make a template permanently uneditable.
CREATE TABLE IF NOT EXISTS "email_designs" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "locale" text DEFAULT 'sv' NOT NULL,
  "template_key" text,
  "subject" text DEFAULT '' NOT NULL,
  "design" jsonb,
  "html" text DEFAULT '' NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- At most ONE active design per (template_key, locale). Without it, two active
-- designs for the same email is an ambiguity settled by whichever row the
-- query happens to return first. Partial, so unbound drafts are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS "email_designs_active_per_key"
  ON "email_designs" ("template_key", "locale")
  WHERE "is_active" = true AND "template_key" IS NOT NULL;--> statement-breakpoint

COMMENT ON COLUMN "email_designs"."design" IS 'Unlayer design JSON — the only format the editor can re-open. Do not drop it in favour of the HTML.';--> statement-breakpoint
COMMENT ON COLUMN "email_designs"."is_active" IS 'Off by default: a new design must not replace a tested transactional email the moment it is saved.';
