-- Where a visitor was, coarsely, when they arrived.
--
-- `page_visits` recorded device, browser and path but nothing about location,
-- so the dashboard could say how people browse and not where they are. That
-- is the question a shop selling turbos actually needs answered: Swedish
-- traffic and export traffic want different copy, currency and shipping
-- defaults.
--
-- Three columns rather than one because country alone is too coarse to act on
-- for a domestic shop -- nearly everything is "SE" -- and a city is what makes
-- that number useful.
--
-- Nullable with no backfill, deliberately. Location is derived from the
-- request's IP at the moment of the visit and no IP is stored, so there is
-- nothing to reconstruct an older row from. Every visit before this migration
-- stays unknown, and the dashboard reports that bucket plainly instead of
-- quietly dropping it.

ALTER TABLE "page_visits"
  ADD COLUMN IF NOT EXISTS "country" text;

ALTER TABLE "page_visits"
  ADD COLUMN IF NOT EXISTS "region" text;

ALTER TABLE "page_visits"
  ADD COLUMN IF NOT EXISTS "city" text;

-- The dashboard groups by country over a date window, which is this pair.
CREATE INDEX IF NOT EXISTS "page_visits_country_idx" ON "page_visits" ("country");
CREATE INDEX IF NOT EXISTS "page_visits_created_at_idx" ON "page_visits" ("created_at");
