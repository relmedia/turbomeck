-- Per-product shipment details for the admin's "Försändelse" section, mirroring
-- PostNord's own shipment form. `weight` already existed and keeps its meaning;
-- these columns add the shipment class and the optional parcel dimensions.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "shipment_type" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "length_cm" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "width_cm" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "height_cm" integer;--> statement-breakpoint

COMMENT ON COLUMN "products"."shipment_type" IS 'PostNord shipment class: light (Lätt, max 3 kg), heavy (Tung, max 35 kg) or pallet (Pall, max 1000 kg). NULL on products created before this section existed.';--> statement-breakpoint
COMMENT ON COLUMN "products"."length_cm" IS 'Parcel length in whole cm. Optional, as in PostNord''s "Mått (valfritt)".';--> statement-breakpoint
COMMENT ON COLUMN "products"."width_cm" IS 'Parcel width in whole cm. Optional.';--> statement-breakpoint
COMMENT ON COLUMN "products"."height_cm" IS 'Parcel height in whole cm. Optional.';
