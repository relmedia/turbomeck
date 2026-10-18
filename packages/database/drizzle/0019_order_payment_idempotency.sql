-- Guard against two orders for one Stripe payment, and stop handing out order
-- numbers with count(*).
--
-- Fails loudly if the table already holds duplicates: an order is a financial
-- record, so reconciling which of a pair to keep is the operator's call, not a
-- migration's. Run the SELECT the message names, decide, delete, re-run.
DO $$
DECLARE
  dupes text;
BEGIN
  SELECT string_agg(stripe_payment_id || ' (' || cnt || ' orders)', ', ')
    INTO dupes
  FROM (
    SELECT stripe_payment_id, count(*) AS cnt
    FROM orders
    WHERE stripe_payment_id IS NOT NULL
    GROUP BY stripe_payment_id
    HAVING count(*) > 1
  ) d;

  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'orders already holds duplicate stripe_payment_id values: %. Reconcile them before adding the unique index. List them with: SELECT stripe_payment_id, array_agg(id ORDER BY id), array_agg(order_number ORDER BY id), array_agg(created_at ORDER BY id) FROM orders WHERE stripe_payment_id IS NOT NULL GROUP BY stripe_payment_id HAVING count(*) > 1;',
      dupes;
  END IF;
END $$;--> statement-breakpoint

-- One order per PaymentIntent, enforced by the database rather than by a
-- check-then-insert in application code that two concurrent writers both pass.
-- Not partial: Postgres already treats NULLs as distinct, so zero-total orders
-- (which store NULL here) are unaffected, and a bare column target keeps
-- `ON CONFLICT (stripe_payment_id)` inference working without a predicate.
CREATE UNIQUE INDEX IF NOT EXISTS "orders_stripe_payment_id_unique"
  ON "orders" ("stripe_payment_id");--> statement-breakpoint

COMMENT ON INDEX "orders_stripe_payment_id_unique" IS 'One order per Stripe PaymentIntent. Both the browser POST /api/orders and the webhook-driven checkout-intent finalize can race to create the same order; this is what makes the loser a no-op instead of a duplicate.';--> statement-breakpoint

-- Order numbers used to be ORDER_NUMBER_START + count(*), read in application
-- code before the insert. Two concurrent checkouts read the same count and were
-- issued the SAME number, and deleting any order made the next one collide with
-- a number already in use. A sequence is atomic and never reissues.
--
-- Seeded above the highest number already in the table so no existing order
-- number is ever handed out again. 257 is the historical ORDER_NUMBER_START and
-- acts as the floor for an empty table.
CREATE SEQUENCE IF NOT EXISTS "orders_order_number_seq" AS bigint START WITH 257 MINVALUE 257;--> statement-breakpoint

SELECT setval(
  'orders_order_number_seq',
  GREATEST(
    257,
    COALESCE(
      (SELECT max((regexp_replace(order_number, '\D', '', 'g'))::bigint)
       FROM orders
       WHERE order_number ~ '^#?[0-9]+$'),
      0
    ) + 1
  ),
  false
);
