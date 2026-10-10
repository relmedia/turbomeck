import type { ProductType } from "@/types";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";
import { productUrl } from "@/lib/utils";
import { htmlToText, truncateAtWord } from "@/lib/html-text";
import { getShippingPrice } from "@/lib/postnord";

/**
 * Structured data, rendered from Server Components only.
 *
 * These must be in the initial HTML — Google's structured-data parsing does
 * not wait on client hydration — so nothing in this file may be a client
 * component or read browser state.
 */

/**
 * The payload is embedded in a <script> element, where a literal
 * "</script>" inside any string value would close the tag early and the
 * rest would be parsed as markup. Escaping `<` makes that unrepresentable.
 *
 * Nothing else needs escaping here: the element is
 * type="application/ld+json", so the browser parses the contents as JSON
 * text rather than as JavaScript, and JSON permits raw U+2028/U+2029.
 */
function serialize(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function JsonLdScript({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // Safe: `serialize` escapes the only characters that can break out of a
      // script element, and the payload is our own catalogue data.
      dangerouslySetInnerHTML={{ __html: serialize(data) }}
    />
  );
}

const CONTACT_PHONE = "+46709165006";
const CONTACT_EMAIL = "shop@turbomeck.se";

/**
 * Shipping and returns, as stated in the Köpvillkor (`/terms`).
 *
 * Google's merchant-listing enrichment reads these off the Offer; every value
 * below has to stay in step with the terms page, because the markup is a
 * public promise about what a buyer is charged and what they can send back.
 */

/** Terms §4: PostNord, 2–5 business days within the Nordics. */
const TRANSIT_DAYS_MIN = 2;
const TRANSIT_DAYS_MAX = 5;

/** Terms §5: 14-day right of withdrawal, return postage paid by the buyer. */
const RETURN_WINDOW_DAYS = 14;

/**
 * The quoted rate is Sweden-only and per-product.
 *
 * Rates are weight- and country-banded (`getShippingPrice`), so a single
 * figure can only be honest for one destination and one parcel. Sweden is the
 * home market and the only destination PostNord bands cheaply enough to be
 * worth advertising; the other countries resolve at checkout.
 *
 * `product.weight` is nullable in the catalogue, and 1 kg is the same
 * assumption the cart already quotes against (`app/cart/page.tsx:91`), so a
 * weightless product advertises exactly what it will later be charged.
 */
function shippingDetailsSE(product: ProductType) {
  return {
    "@type": "OfferShippingDetails",
    shippingRate: {
      "@type": "MonetaryAmount",
      value: getShippingPrice(product.weight ?? 1, "SE", "servicepoint"),
      currency: "SEK",
    },
    shippingDestination: {
      "@type": "DefinedRegion",
      addressCountry: "SE",
    },
    // `handlingTime` is deliberately absent: the terms commit to a delivery
    // window but never to a dispatch time, and inventing one here would
    // advertise a promise the shop has not made.
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      transitTime: {
        "@type": "QuantitativeValue",
        minValue: TRANSIT_DAYS_MIN,
        maxValue: TRANSIT_DAYS_MAX,
        unitCode: "DAY",
      },
    },
  };
}

/** Terms §5, as schema.org. Consumer withdrawal under Swedish law. */
function merchantReturnPolicy() {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "SE",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: RETURN_WINDOW_DAYS,
    returnMethod: "https://schema.org/ReturnByMail",
    // The buyer pays return postage, and the amount is whatever the carrier
    // charges them directly — so the category is stated without a figure
    // rather than with a made-up one.
    returnFees: "https://schema.org/ReturnShippingFees",
    refundType: "https://schema.org/FullRefund",
    merchantReturnLink: absoluteUrl("/terms"),
  };
}

/** Organization + WebSite. Rendered once, from the root layout. */
export function OrganizationJsonLd() {
  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            name: SITE_NAME,
            url: SITE_URL,
            logo: absoluteUrl("/logo.png"),
            email: CONTACT_EMAIL,
            telephone: CONTACT_PHONE,
            contactPoint: {
              "@type": "ContactPoint",
              contactType: "customer service",
              telephone: CONTACT_PHONE,
              email: CONTACT_EMAIL,
              areaServed: "SE",
              availableLanguage: ["Swedish", "English"],
            },
          },
          {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            url: SITE_URL,
            name: SITE_NAME,
            inLanguage: "sv-SE",
            publisher: { "@id": `${SITE_URL}/#organization` },
          },
        ],
      }}
    />
  );
}

export type BreadcrumbEntry = { name: string; path: string };

/** BreadcrumbList mirroring the visual trail on the product page. */
export function BreadcrumbJsonLd({ items }: { items: BreadcrumbEntry[] }) {
  if (items.length === 0) return null;
  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: item.name,
          item: absoluteUrl(item.path),
        })),
      }}
    />
  );
}

/**
 * Product + Offer, with AggregateRating only when reviews actually exist.
 *
 * Google rejects an AggregateRating whose reviewCount is 0, and emitting one
 * with a 0-star value would be worse than emitting none — so the node is
 * omitted entirely rather than defaulted.
 *
 * There is no brand, SKU, GTIN or MPN column in the catalogue, so `sku` falls
 * back to the product id and `brand` is the store itself. That keeps the
 * markup valid; adding real part numbers would make it genuinely rich.
 */
export function ProductJsonLd({ product }: { product: ProductType }) {
  const url = absoluteUrl(productUrl(product));
  const rating =
    product.averageRating != null && (product.reviewCount ?? 0) > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.averageRating,
            reviewCount: product.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {};

  // Both fields are admin-authored rich text, so tags are stripped: schema.org
  // `description` is a plain-text property and Google shows markup verbatim.
  const description =
    htmlToText(product.shortDescription) ||
    htmlToText(product.description) ||
    product.name;

  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": `${url}#product`,
        name: product.name,
        description,
        image: (product.galleryImages?.length
          ? product.galleryImages
          : [product.images?.default]
        ).filter(Boolean),
        sku: String(product.id),
        brand: { "@type": "Brand", name: SITE_NAME },
        ...(product.weight != null
          ? { weight: { "@type": "QuantitativeValue", value: product.weight, unitCode: "KGM" } }
          : {}),
        offers: {
          "@type": "Offer",
          url,
          // SEK is the catalogue's base currency — the storefront's display
          // conversion is presentational and must not be advertised as the
          // price a buyer is charged.
          priceCurrency: "SEK",
          price: product.price,
          availability:
            (product.stock ?? 0) > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
          seller: { "@id": `${SITE_URL}/#organization` },
          shippingDetails: shippingDetailsSE(product),
          hasMerchantReturnPolicy: merchantReturnPolicy(),
        },
        ...rating,
      }}
    />
  );
}
