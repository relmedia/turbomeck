# Category card backgrounds

Drop an image here named after the category slug and the landing page's
"browse by category" card picks it up automatically — no code change, no
registration:

    saab.jpg     ->  the Saab card
    volvo.jpg    ->  the Volvo card
    turbo.jpg    ->  the Turbo (parts) card

The slug is whatever `categorySlug()` produces for the category, i.e. the same
value that appears in `/products?category=<slug>`. Open the card's link and
copy the slug from the URL if you are unsure.

Without a file here the card falls back to the first product image from that
category, and without that to the plain charcoal panel. Nothing breaks if the
file is missing: it is layered as a CSS background, and a background layer the
browser cannot load is simply skipped.

Guidelines:
  - landscape, at least 1200x600, JPEG (quality ~80) to keep it light
  - busy or high-contrast photos fight the white category name; the card
    applies a dark scrim, but a calm image still reads better
  - the card crops to `bg-cover bg-center`, so keep the subject centred
