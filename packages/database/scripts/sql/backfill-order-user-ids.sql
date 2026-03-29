-- One-off: attach user_id to guest orders when the email matches "user".email.
-- Run in psql or your SQL client after backup. Review the SELECTs before UPDATE.

-- Preview rows that would be updated
SELECT o.id,
       o.order_number,
       o.email,
       u.id AS matched_user_id
FROM orders o
INNER JOIN "user" u ON lower(trim(o.email)) = lower(trim(u.email))
WHERE (o.user_id IS NULL OR btrim(o.user_id) = '')
ORDER BY o.id;

-- Orders still orphaned (no user with that email)
SELECT o.id, o.order_number, o.email
FROM orders o
WHERE (o.user_id IS NULL OR btrim(o.user_id) = '')
  AND NOT EXISTS (
    SELECT 1
    FROM "user" u
    WHERE lower(trim(u.email)) = lower(trim(o.email))
  )
ORDER BY o.id;

-- Apply (only NULL user_id; does not overwrite existing user_id)
UPDATE orders AS o
SET user_id = u.id
FROM "user" AS u
WHERE (o.user_id IS NULL OR btrim(o.user_id) = '')
  AND lower(trim(o.email)) = lower(trim(u.email));
