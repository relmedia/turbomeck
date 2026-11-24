-- Keep a copy of the mail we actually sent.
--
-- The ledger recorded THAT a mail went out, never WHAT went out. So the
-- E-postlogg could say "Klar att hämta, skickad 24 nov 11:30" and not show
-- the message, and "how did that email look?" had no answer at all.
--
-- Re-rendering it on demand was the obvious alternative and is the wrong one.
-- The template can be edited in E-postdesign afterwards, and the order itself
-- changes -- an address corrected, a tracking number added, a refund taken --
-- so a re-render shows what we WOULD send today, not what the customer got.
-- For a log, that is the one thing it must not be.
--
-- Stored on the existing ledger row rather than in a new table: the unique
-- (order_id, kind) index already makes that row the single record of the mail,
-- and a separate archive table would need the same key plus a join for no
-- gain.
--
-- Nullable with no backfill. The HTML of a mail sent before this migration is
-- gone -- it was never written anywhere, not even to a log file -- so those
-- rows stay empty and the page says so plainly rather than quietly showing a
-- re-render and implying it is the sent copy.
--
-- Size: an order mail is ~30 kB of HTML and a shop sends up to eight per
-- order. Postgres TOAST-compresses text out of line, and email HTML is highly
-- repetitive, so the real cost lands nearer 3-5 kB a row. At a thousand orders
-- that is tens of megabytes, which is not worth a retention policy yet. If it
-- ever is, deleting `html` on rows older than a year keeps the ledger intact
-- because every other column stays.

ALTER TABLE "order_emails"
  ADD COLUMN IF NOT EXISTS "subject" text;

ALTER TABLE "order_emails"
  ADD COLUMN IF NOT EXISTS "html" text;

COMMENT ON COLUMN "order_emails"."subject" IS
  'Subject line as actually sent. NULL for mail sent before archiving existed.';

COMMENT ON COLUMN "order_emails"."html" IS
  'The exact HTML handed to SMTP. NULL for mail sent before archiving existed, and for a superseded row, where no mail was sent at all.';
