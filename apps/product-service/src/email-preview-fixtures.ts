/**
 * Sample data for previewing a design, and the test send that uses it.
 *
 * A design is full of merge tokens, so mailing it raw shows `{{order_number}}`
 * where the order number belongs — useless for judging how it looks. This
 * fills every token with plausible data first.
 *
 * ## Why it reuses the real builders
 *
 * The values come from `orderConfirmationMergeValues` and
 * `shippingNoticeMergeValues` — the same functions that run on a real send —
 * fed a fixture order and a fixture parcel. Writing a second set of sample
 * values by hand would have been less code, but then a preview could look
 * right while the real mail was broken (or the reverse), which defeats the
 * point of previewing. The only thing invented here is the fixture itself.
 *
 * The two sets are merged because a design may use any token: the order
 * confirmation's lines and totals, or a notice's service point. One filled
 * set covers whatever the admin dragged in.
 */

import { db } from "@repo/database";
import { products } from "@repo/database/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import {
  adminNewOrderMergeValues,
  buildMailTransport,
  getMailConfig,
  orderConfirmationMergeValues,
  resolveProductImageUrlForEmail,
  type AdminNewOrderEmailData,
  type OrderEmailData,
} from "./email.js";
import {
  shippingNoticeMergeValues,
  type LocaleCode,
  type ShippingNoticeData,
} from "./email-shipping-notices.js";
import { MERGE_TAGS, applyMergeTags, applyMergeTagsPlain, unknownTokens, type MergeValues } from "./email-merge-tags.js";

/**
 * Stands in for a product photo in the fixture lines.
 *
 * The shop logo rather than an invented product key: it is resolved through
 * the same path a real `order_items.product_image` takes (relative to the R2
 * public base), but it is an asset that actually exists — a made-up key would
 * put a broken-image icon in every preview, which is worse than no thumbnail
 * for judging a layout. With no R2 base configured it resolves to nothing and
 * the block falls back to its placeholder, exactly as a real order would.
 */
const FIXTURE_THUMBNAIL = "branding/logo.png";

/**
 * A two-line order with a discount, in SEK.
 *
 * Two lines rather than one so the repeating block visibly repeats, and a
 * quantity above one so a wrong line total shows up as wrong. Deliberately a
 * Swedish domestic order: the export case has its own coverage in the
 * verification harness, and a preview should look like the common case.
 */
const FIXTURE_ORDER: OrderEmailData = {
  orderNumber: "TM-2026-0042",
  currency: "SEK",
  firstName: "Anna",
  lastName: "Lindqvist",
  email: "anna.lindqvist@example.se",
  address: "Storgatan 14",
  city: "Göteborg",
  postalCode: "41117",
  country: "SE",
  servicePointName: "ICA Supermarket Backaplan",
  deliveryOption: "service_point",
  subtotal: 17240,
  shippingCost: 249,
  discount: 500,
  total: 16989,
  vatAmount: 3398,
  vatTreatment: "standard",
  trackingId: "00573132902028050319",
  locale: "sv",
  paymentMethodDisplay: "Visa •••• 4242",
  items: [
    {
      productName: "Turbo Garrett GT2860RS",
      productImage: FIXTURE_THUMBNAIL,
      variant: "Steg 2",
      price: 16490,
      quantity: 1,
    },
    {
      productName: "Oljeslang & packningskit",
      productImage: FIXTURE_THUMBNAIL,
      variant: null,
      price: 375,
      quantity: 2,
    },
  ],
};

/**
 * The same order as the shop sees it.
 *
 * Derived from FIXTURE_ORDER rather than written out again, so a preview of
 * the admin alert and a preview of the customer receipt describe one purchase
 * — two sets of invented numbers would make the pair impossible to compare.
 */
const FIXTURE_ADMIN: AdminNewOrderEmailData = {
  orderNumber: FIXTURE_ORDER.orderNumber,
  orderId: 42,
  currency: FIXTURE_ORDER.currency,
  firstName: FIXTURE_ORDER.firstName,
  lastName: FIXTURE_ORDER.lastName,
  email: FIXTURE_ORDER.email,
  phone: "070-123 45 67",
  address: FIXTURE_ORDER.address,
  city: FIXTURE_ORDER.city,
  postalCode: FIXTURE_ORDER.postalCode,
  country: FIXTURE_ORDER.country,
  servicePointName: FIXTURE_ORDER.servicePointName,
  deliveryOption: FIXTURE_ORDER.deliveryOption,
  subtotal: FIXTURE_ORDER.subtotal,
  shippingCost: FIXTURE_ORDER.shippingCost,
  discount: FIXTURE_ORDER.discount,
  total: FIXTURE_ORDER.total,
  paymentMethodDisplay: FIXTURE_ORDER.paymentMethodDisplay,
  items: FIXTURE_ORDER.items,
};

const FIXTURE_PARCEL: ShippingNoticeData = {
  firstName: "Anna",
  email: "anna.lindqvist@example.se",
  orderNumber: "TM-2026-0042",
  trackingId: "00573132902028050319",
  servicePointName: "ICA Supermarket Backaplan",
  servicePointStreet: "Backaplan 2",
  servicePointPostalCode: "41705",
  servicePointCity: "Göteborg",
  /** A fortnight out, so the formatted date is obviously a real date. */
  coreReturnDeadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  locale: "sv",
};

/**
 * One real catalogue product, standing in for a fixture line.
 *
 * Only the name and the image: prices and quantities stay fixture values, so
 * the hard-coded subtotal and total keep adding up.
 */
export type PreviewProduct = { productName: string; productImage: string | null };

/**
 * The newest published products that actually have an image.
 *
 * A test send is the admin asking "what will my customer get", and until now
 * it answered with the shop logo pasted in as a product photo. That is enough
 * to judge spacing and nothing else: it cannot show whether THEIR images
 * reach an inbox, which is the part that actually breaks (wrong format, a
 * stale snapshot URL, an R2 base that is not public).
 *
 * Returns an empty list rather than throwing. A catalogue with no usable
 * image is a normal state for a new shop, and a preview that refuses to send
 * because of it would be worse than one that falls back to the fixture.
 */
export async function resolvePreviewProducts(limit = 2): Promise<PreviewProduct[]> {
  try {
    const rows = await db
      .select({ name: products.name, image: products.image })
      .from(products)
      .where(and(isNotNull(products.image), eq(products.published, true)))
      .orderBy(desc(products.id))
      .limit(limit);
    return rows
      .filter((r) => r.image && String(r.image).trim())
      .map((r) => ({ productName: r.name, productImage: r.image }));
  } catch (error) {
    console.error("[preview] could not read a sample product:", error);
    return [];
  }
}

/**
 * Every token filled with sample data.
 *
 * Notice values are applied first and order values second, so where both
 * define a token the order confirmation wins — its builder is the richer of
 * the two (it formats money in the order's own currency).
 *
 * `realProducts` replaces the leading fixture lines positionally, so a test
 * send shows the shop's own products while the money stays fixture money.
 * Passed in rather than queried here: this stays synchronous and
 * database-free, which is what `__verify-preview-fixtures` relies on.
 */
export function sampleMergeValues(
  locale: LocaleCode,
  realProducts: PreviewProduct[] = [],
): MergeValues {
  const items = FIXTURE_ORDER.items.map((item, i) => {
    const real = realProducts[i];
    return real
      ? { ...item, productName: real.productName, productImage: real.productImage }
      : item;
  });
  const order = orderConfirmationMergeValues({ ...FIXTURE_ORDER, items, locale });
  const notice = shippingNoticeMergeValues(
    { ...FIXTURE_PARCEL, locale },
    locale,
    FIXTURE_PARCEL.orderNumber,
  );

  /**
   * The admin alert contributes the tokens only it carries — the phone number
   * and the studio deep link. It is applied BEFORE the order values so that
   * where the two overlap the customer receipt still wins: its builder is the
   * richer of the two (it states VAT, which the admin payload cannot).
   */
  const admin = adminNewOrderMergeValues({ ...FIXTURE_ADMIN, items });

  const scalars = { ...notice.scalars, ...admin.scalars, ...order.scalars };
  const blocks = { ...notice.blocks, ...admin.blocks, ...order.blocks };

  /**
   * Any catalogued token the two builders between them do not produce would
   * otherwise survive into the preview as a literal `{{…}}` and read as a
   * bug in the design rather than a gap here. Backfilling from the
   * catalogue's own sample keeps a preview legible, and the warning says
   * which token needs wiring up for real.
   */
  for (const tag of MERGE_TAGS) {
    if (tag.kind === "block") {
      if (blocks[tag.token] === undefined) {
        console.warn(`[preview] no block renderer for {{${tag.token}}}`);
        blocks[tag.token] = "";
      }
      continue;
    }
    if (scalars[tag.token] === undefined) {
      console.warn(`[preview] no sample value for {{${tag.token}}}, using the catalogue sample`);
      scalars[tag.token] = tag.sample;
    }
  }

  return { scalars, blocks };
}

/** The banner a preview carries so it cannot be mistaken for a real mail. */
export function previewBanner(locale: LocaleCode): string {
  const text =
    locale === "en"
      ? "Test email — sample data, not a real order."
      : "Testmejl — exempeldata, inte en verklig order.";
  return (
    `<div style="background-color:#fef3c7;color:#92400e;font:13px/1.5 arial,helvetica,sans-serif;` +
    `padding:10px 16px;text-align:center;border-bottom:1px solid #fde68a;">${text}</div>`
  );
}

/* ------------------------------------------------------------------ *
 * The test send
 * ------------------------------------------------------------------ */

export type PreviewSendResult = {
  recipient: string;
  /** Tokens the design uses that nothing fills — shown back to the admin. */
  unknown: string[];
  /**
   * The catalogue products the test used, so the admin can tell a real
   * product photo from the fixture fallback without opening the mail.
   */
  products: string[];
  /**
   * Why a product image will not reach some inboxes, when that is the case.
   * Reported because the alternative is an admin seeing a broken image and
   * concluding the template is wrong, when the cause is image format or
   * configuration.
   */
  imageWarning?: string;
};

/**
 * Whether the images in this test will actually render for a recipient.
 *
 * Checks the URL the mail will really carry — the output of the same resolver
 * the live mail uses — rather than what is stored, so a working JPEG proxy is
 * correctly reported as fine.
 *
 * AVIF and WebP are the formats at issue: the storefront serves them because
 * they are small, and Outlook will not draw either. `/api/email/img` exists to
 * hand those clients a JPEG, and when it is unreachable the resolver returns
 * the original URL untouched — which is exactly what this detects.
 */
export function describeImageProblem(lines: PreviewProduct[]): string | undefined {
  const resolved = lines
    .map((l) => resolveProductImageUrlForEmail(l.productImage))
    .filter((u): u is string => !!u);

  if (lines.length > 0 && resolved.length === 0) {
    return "Produktbilderna kunde inte göras om till publika adresser (saknad R2-bas) — mejlet visar gråa platshållare.";
  }
  const stillVector = resolved.filter((u) => /\.(avif|webp)(\?|#|$)/i.test(u));
  if (stillVector.length > 0) {
    return (
      `${stillVector.length} av ${resolved.length} produktbilder skickas som AVIF/WebP. ` +
      "Outlook visar dem inte. Sätt EMAIL_IMAGE_PROXY_BASE_URL till en publik https-adress " +
      "som når /api/email/img, så skickas de som JPEG."
    );
  }
  return undefined;
}

/**
 * Mail a design to one address, filled with sample data.
 *
 * Uses the stored mail configuration — the same transport the real
 * transactional mail goes out on. A preview that went through a different
 * sender would not tell the admin what a customer will actually receive,
 * which is the one thing it exists to do.
 *
 * Nothing is recorded in the order_emails ledger: there is no order, and a
 * preview must never consume the send-once slot that a real notice needs.
 */
export async function sendDesignPreview(args: {
  to: string;
  subject: string;
  html: string;
  locale: LocaleCode;
}): Promise<PreviewSendResult> {
  const { to, subject, html, locale } = args;
  if (!to.includes("@")) throw new Error("Ogiltig mottagaradress");
  if (!html.trim()) throw new Error("Mallen har inget innehåll att skicka");

  const config = await getMailConfig();
  if (!config) throw new Error("E-post är inte konfigurerat (SMTP saknas)");

  /**
   * Real products, so the test answers "will my customers see their product
   * photos" instead of only "does the layout hold". Falls back to the fixture
   * line silently when the catalogue has nothing usable.
   */
  const realProducts = await resolvePreviewProducts();
  const values = sampleMergeValues(locale, realProducts);
  const filledHtml = applyMergeTags(html, values);
  const filledSubject = applyMergeTagsPlain(subject, values).trim();

  /**
   * The banner goes in front of the body rather than inside it, so the design
   * being judged is untouched. Prepending to the string is enough: mail
   * clients render a leading div above the table that follows.
   */
  const body = previewBanner(locale) + filledHtml;

  const transporter = buildMailTransport(config);

  await transporter.sendMail({
    from: `"Turbomeck" <${config.from}>`,
    to,
    /** Marked in the subject too: the banner is invisible in an inbox list. */
    subject: `[TEST] ${filledSubject || "E-postmall"}`,
    html: body,
  });

  console.log(`[email] design preview sent to ${to}`);
  return {
    recipient: to,
    unknown: unknownTokens(html),
    products: realProducts.map((p) => p.productName),
    imageWarning: describeImageProblem(
      realProducts.length > 0
        ? realProducts
        : FIXTURE_ORDER.items.map((i) => ({
            productName: i.productName,
            productImage: i.productImage ?? null,
          })),
    ),
  };
}
