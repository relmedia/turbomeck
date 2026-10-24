-- Record how each sale was treated for VAT, instead of re-deriving it forever.
--
-- Why: a sale to outside the EU is a zero-rated export in Sweden, and the buyer
-- pays their own import VAT at the border. The shop charged Swedish 25% anyway
-- — `getShippingPrice` ended in an unconditional `* 1.25` with no country
-- branch, and catalogue prices are stored VAT-inclusive — so a Norwegian buyer
-- was taxed twice and the shop over-collected output VAT on a sale that owed
-- none. Order TM-2026-0001 carried roughly 1 899 SEK of Swedish VAT it should
-- not have.
--
-- Why columns rather than a computed value: there was no VAT column at all.
-- Every figure the customer and the admin ever saw was recomputed on the fly as
-- `total * 0.2` in four separate places — right for a 25%-inclusive Swedish
-- price, meaningless for an export. The confirmation email for that Norwegian
-- order printed "Varav moms (25%)" in NOK. A rate charged at the time of sale
-- is a fact about that sale and has to be stored with it.
--
-- Defaults match the historical behaviour (Swedish 25%, VAT-inclusive), so
-- existing rows keep describing what actually happened to them. The backfill
-- below corrects only the rows that are demonstrably exports.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "vat_treatment" text DEFAULT 'domestic' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "vat_rate" numeric(5,4) DEFAULT '0.2500' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "vat_amount" numeric(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint

COMMENT ON COLUMN "orders"."vat_treatment" IS 'domestic | eu_b2c | export_zero_rated. Decided from the destination country at checkout.';--> statement-breakpoint
COMMENT ON COLUMN "orders"."vat_amount" IS 'VAT contained in total, in the order currency. Zero on a zero-rated export.';--> statement-breakpoint

-- Backfill: existing SE and EU orders are VAT-inclusive at 25%, so their VAT is
-- the gross/5. Rounded to 2dp to match the column.
UPDATE "orders"
SET "vat_treatment" = 'domestic',
    "vat_rate"      = 0.2500,
    "vat_amount"    = ROUND("total" * 0.2000, 2)
WHERE "country" = 'SE';--> statement-breakpoint

UPDATE "orders"
SET "vat_treatment" = 'eu_b2c',
    "vat_rate"      = 0.2500,
    "vat_amount"    = ROUND("total" * 0.2000, 2)
WHERE "country" IN ('AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR',
                    'HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO',
                    'SI','SK');--> statement-breakpoint

-- Everything else is outside the EU and should have been zero-rated.
--
-- vat_amount is set to 0 because that is what SHOULD have been charged, not
-- what was. The difference is a bookkeeping correction, not something this
-- migration can make: the money was captured by Stripe at the old total and
-- only an accountant can decide between a credit-and-rebill and a VAT
-- adjustment. Flagged in meta so those orders can be listed later.
UPDATE "orders"
SET "vat_treatment" = 'export_zero_rated',
    "vat_rate"      = 0,
    "vat_amount"    = 0
WHERE "country" NOT IN ('SE','AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI',
                        'FR','GR','HR','HU','IE','IT','LT','LU','LV','MT','NL',
                        'PL','PT','RO','SI','SK');
