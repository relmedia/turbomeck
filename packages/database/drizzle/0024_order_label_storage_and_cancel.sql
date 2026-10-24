-- Store the booked label, and record a cancellation made in PostNord's portal.
--
-- `post_nord_label_pdf` exists because re-requesting a label is DESTRUCTIVE:
-- `/rest/shipment/v3/edi/labels/pdf` is book-and-print, not print. Every POST
-- of the EDI instruction registers a new parcel — two identical calls returned
-- parcels 00573132902027512511 and 00573132902027512528, neither being the one
-- the order was booked as. Booking now requests the label once and keeps it
-- here; reprints read this column and never call PostNord.
--
-- `post_nord_booking_cancelled_at` exists because PostNord has no cancellation
-- API: the delete endpoint is absent from the Booking API specification, and
-- `updateIndicator: "Deletion"` is ignored and books a new shipment instead.
-- Cancelling is done in PostNord's portal, and this records that it happened so
-- admin stops claiming the order is booked. The tracking id and label are kept
-- on purpose — they are the history of a parcel that existed and was billed.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "post_nord_label_pdf" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "post_nord_label_paper_size" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "post_nord_booking_cancelled_at" timestamp;--> statement-breakpoint

COMMENT ON COLUMN "orders"."post_nord_label_pdf" IS 'Base64 PDF of the booked shipping label, captured at booking time. Reprints must read this rather than re-POST the EDI instruction, which would book another parcel.';--> statement-breakpoint
COMMENT ON COLUMN "orders"."post_nord_booking_cancelled_at" IS 'When staff marked the PostNord booking cancelled (cancellation itself happens in PostNord''s portal; they expose no cancel API).';
