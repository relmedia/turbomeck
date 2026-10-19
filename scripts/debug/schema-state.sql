-- Which pending migrations is this database missing?
--
-- Read-only. Run when a service started throwing "column ... does not exist"
-- or "relation ... does not exist" after a deploy: the code was updated but
-- its migration was not.
--
--   cd ~/apps/turbomeck
--   psql "$(sed -n 's/^DATABASE_URL=//p' .env | head -1 | tr -d '\042\047')" \
--     -f scripts/debug/schema-state.sql

\echo '== Migration state ======================================================='
SELECT
  '0019 orders_stripe_payment_id_unique' AS migration_object,
  CASE WHEN to_regclass('public.orders_stripe_payment_id_unique') IS NULL
       THEN 'MISSING  -> order creation fails' ELSE 'ok' END AS status
UNION ALL
SELECT
  '0019 orders_order_number_seq',
  CASE WHEN to_regclass('public.orders_order_number_seq') IS NULL
       THEN 'MISSING  -> order creation fails' ELSE 'ok' END
UNION ALL
SELECT
  '0020 products.shipment_type',
  CASE WHEN NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'products' AND column_name = 'shipment_type')
       THEN 'MISSING  -> every product fetch fails' ELSE 'ok' END
UNION ALL
SELECT
  '0020 products.length_cm / width_cm / height_cm',
  CASE WHEN (SELECT count(*) FROM information_schema.columns
             WHERE table_name = 'products'
               AND column_name IN ('length_cm','width_cm','height_cm')) < 3
       THEN 'MISSING  -> every product fetch fails' ELSE 'ok' END;

\echo ''
\echo '== Blocks migration 0019 (reconcile these first) ========================='
SELECT stripe_payment_id,
       count(*)                            AS orders,
       array_agg(id ORDER BY id)           AS order_ids,
       array_agg(order_number ORDER BY id) AS order_numbers
FROM orders
WHERE stripe_payment_id IS NOT NULL
GROUP BY stripe_payment_id
HAVING count(*) > 1;
