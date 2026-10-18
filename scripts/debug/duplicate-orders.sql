-- Find orders that share a Stripe payment: one payment, several order rows.
--
-- Run on the server (read-only, safe any time):
--   docker exec -i turbodb psql -U postgres -d turbodb -f - < scripts/debug/duplicate-orders.sql
--
-- Migration 0019 adds a unique index that makes this impossible going forward,
-- and refuses to apply while any row below exists. Use this to find what has to
-- be reconciled first, and to confirm nothing came back afterwards.

\echo '== 1. Payments with more than one order =================================='
-- `gap` is the tell. Sub-second means the two writers raced: the browser's
-- POST /api/orders and the webhook's checkout-intent finalize both passed their
-- "does an order exist yet?" check before either had inserted. Minutes apart
-- means a webhook retry instead. Same root cause, different trigger.
SELECT
  stripe_payment_id,
  count(*)                              AS orders,
  array_agg(id ORDER BY id)             AS order_ids,
  array_agg(order_number ORDER BY id)   AS order_numbers,
  array_agg(status ORDER BY id)         AS statuses,
  min(created_at)                       AS first_created,
  max(created_at) - min(created_at)     AS gap
FROM orders
WHERE stripe_payment_id IS NOT NULL
GROUP BY stripe_payment_id
HAVING count(*) > 1
ORDER BY min(created_at) DESC;

\echo ''
\echo '== 2. Which row the webhook created ======================================'
-- checkout_intent.order_id is the order the webhook''s finalize produced, so the
-- OTHER id in the pair above came from the browser POST. Deleting the webhook''s
-- row is usually right, unless its data is the better of the two.
SELECT ci.payment_intent_id, ci.order_id AS webhook_created_order_id,
       ci.consumed_at, ci.quoted_charge_sek, ci.created_at
FROM checkout_intent ci
WHERE ci.payment_intent_id IN (
  SELECT stripe_payment_id FROM orders
  WHERE stripe_payment_id IS NOT NULL
  GROUP BY stripe_payment_id HAVING count(*) > 1
);

\echo ''
\echo '== 3. Side-by-side, to pick which to keep ================================'
SELECT o.id, o.order_number, o.stripe_payment_id, o.status, o.email,
       o.total, o.currency, o.post_nord_tracking_id, o.created_at,
       (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS line_items
FROM orders o
WHERE o.stripe_payment_id IN (
  SELECT stripe_payment_id FROM orders
  WHERE stripe_payment_id IS NOT NULL
  GROUP BY stripe_payment_id HAVING count(*) > 1
)
ORDER BY o.stripe_payment_id, o.id;

\echo ''
\echo '== 4. Order numbers issued more than once ================================'
-- The old generator was ORDER_NUMBER_START + count(*), read before the insert,
-- so two concurrent checkouts were handed the SAME number. Migration 0019
-- replaces it with a sequence. Numbers already duplicated stay duplicated;
-- this lists them.
SELECT order_number, count(*) AS orders, array_agg(id ORDER BY id) AS order_ids
FROM orders
GROUP BY order_number
HAVING count(*) > 1
ORDER BY 2 DESC, 1;
