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

import {
  buildMailTransport,
  getMailConfig,
  orderConfirmationMergeValues,
  type OrderEmailData,
} from "./email.js";
import {
  shippingNoticeMergeValues,
  type LocaleCode,
  type ShippingNoticeData,
} from "./email-shipping-notices.js";
import { MERGE_TAGS, applyMergeTags, applyMergeTagsPlain, unknownTokens, type MergeValues } from "./email-merge-tags.js";

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
      productImage: null,
      variant: "Steg 2",
      price: 16490,
      quantity: 1,
    },
    {
      productName: "Oljeslang & packningskit",
      productImage: null,
      variant: null,
      price: 375,
      quantity: 2,
    },
  ],
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
 * Every token filled with sample data.
 *
 * Notice values are applied first and order values second, so where both
 * define a token the order confirmation wins — its builder is the richer of
 * the two (it formats money in the order's own currency).
 */
export function sampleMergeValues(locale: LocaleCode): MergeValues {
  const order = orderConfirmationMergeValues({ ...FIXTURE_ORDER, locale });
  const notice = shippingNoticeMergeValues(
    { ...FIXTURE_PARCEL, locale },
    locale,
    FIXTURE_PARCEL.orderNumber,
  );

  const scalars = { ...notice.scalars, ...order.scalars };
  const blocks = { ...notice.blocks, ...order.blocks };

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
};

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

  const values = sampleMergeValues(locale);
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
  return { recipient: to, unknown: unknownTokens(html) };
}
