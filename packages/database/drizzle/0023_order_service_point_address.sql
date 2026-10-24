-- The chosen service point's own postal address, stored on the order.
--
-- PostNord rejects an EDI booking whose `deliveryParty` carries only a
-- `partyId`:
--   {"explanationText":"address is a required field",
--    "CustomerOriginValidationError.subType":"ADDRESS"}
--
-- It cannot be recovered later: every by-id service point lookup is retired —
-- `businesslocation/v5/servicepoints/{id}`, and `findByServicePointId` on both
-- v1 and v5, all answer 410 Gone. The address therefore has to be captured at
-- the moment the customer picks the point, or it is gone for good.
--
-- All four stay nullable: home deliveries have no service point, and orders
-- that predate this column cannot be backfilled.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "service_point_street" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "service_point_postal_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "service_point_city" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "service_point_country_code" text;--> statement-breakpoint

COMMENT ON COLUMN "orders"."service_point_street" IS 'Street of the chosen PostNord service point, required in the EDI booking deliveryParty. NULL for home delivery and for orders created before this column.';
