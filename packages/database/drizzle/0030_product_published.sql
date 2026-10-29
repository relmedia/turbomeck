-- Whether a product is visible in the shop.
--
-- There was no such flag: every row in `products` was live the moment it was
-- saved, so the only way to hide one was to delete it or leave it at zero
-- stock — which still shows the page, just unbuyable.
--
-- Defaults to TRUE and is backfilled the same way, so nothing disappears when
-- this lands. Hiding a product becomes a deliberate act.

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "published" boolean DEFAULT true NOT NULL;

-- The storefront filters on it on every listing and every product page.
CREATE INDEX IF NOT EXISTS "products_published_idx" ON "products" ("published");
