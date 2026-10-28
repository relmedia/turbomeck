-- Store the product slug instead of deriving it from the name on every read.
--
-- The URL was `productNameToSlug(p.name)`, computed at read time, so renaming
-- a product silently changed its address and the old one 404'd. That is fine
-- until something starts suggesting better names — then every accepted
-- suggestion throws away whatever ranking and links that URL had.
--
-- The backfill reproduces `productNameToSlug` exactly (index.ts:1102), in the
-- same order of operations, so every existing product keeps the URL it has
-- today. Nothing moves; this only stops future renames from moving it.

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "slug" text;

UPDATE "products"
SET "slug" = COALESCE(
  NULLIF(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            translate(lower(btrim("name")), 'åäö', 'aao'),
            '\s+', '-', 'g'
          ),
          '[^a-z0-9-]', '', 'g'
        ),
        '-+', '-', 'g'
      ),
      '^-|-$', '', 'g'
    ),
    ''
  ),
  'product'
)
WHERE "slug" IS NULL;

-- Two products must never share an address. Not UNIQUE outright: the index
-- build is what proves it, and a partial index keeps rows with no slug (there
-- should be none after the backfill) from blocking it.
CREATE UNIQUE INDEX IF NOT EXISTS "products_slug_unique"
  ON "products" ("slug")
  WHERE "slug" IS NOT NULL;
