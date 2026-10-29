-- Who uploaded which image, and when.
--
-- R2 knows an object's key, size and last-modified date, and nothing about
-- the person who put it there. The upload endpoint never knew either: it is
-- called with a service secret, so by the time bytes reach it the admin's
-- identity is gone.
--
-- This records it at the one place that does know — the admin proxy every
-- upload already passes through, which has the session. Nothing retroactive
-- is possible: images uploaded before this table existed have no uploader and
-- the media library shows them as unknown rather than guessing.

CREATE TABLE IF NOT EXISTS "media_uploads" (
  "id" serial PRIMARY KEY NOT NULL,
  -- The R2 object key, without bucket or query string. The public URL can
  -- carry a ?v= cache-buster and the base host can change, so neither is a
  -- stable identity.
  "object_key" text NOT NULL,
  "uploaded_by_id" text,
  -- Denormalised on purpose: the library must still say who uploaded an
  -- image after that account is deleted, and a null name there would lose
  -- the only answer anyone wanted from this table.
  "uploaded_by_name" text,
  "uploaded_by_email" text,
  "original_name" text,
  "byte_size" integer,
  "uploaded_at" timestamp DEFAULT now() NOT NULL
);

-- One row per object. An upload that somehow repeats a key is an overwrite,
-- not a second file, and the later uploader is the right answer.
CREATE UNIQUE INDEX IF NOT EXISTS "media_uploads_object_key_unique"
  ON "media_uploads" ("object_key");

CREATE INDEX IF NOT EXISTS "media_uploads_uploaded_at_idx"
  ON "media_uploads" ("uploaded_at" DESC);
