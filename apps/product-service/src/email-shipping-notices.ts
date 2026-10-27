/**
 * The automated shipping notices: ready-for-pickup, the two pickup reminders,
 * and delivered.
 *
 * These are sent by the shipping poller off PostNord's own status enum, with no
 * human in the loop, so they are the first mails in this app that nobody
 * reviews before they go out. Two consequences shape this file:
 *
 *  - Every one is governed by a toggle in the mail settings row
 *    (`isCustomerEmailEnabled`), and reports `sent: false` with a reason rather
 *    than throwing when switched off — the caller then releases its ledger
 *    claim so the mail can still go if the toggle is turned back on.
 *  - They share ONE shell. The existing order mails each carry their own
 *    ~80-line table, and the four of them would have been four more copies of
 *    the same markup differing by a word and a colour. Here the shell is a
 *    function and each notice is data.
 *
 * Timing note that matters more than the markup: PostNord holds a parcel at a
 * service point for **3 days**, cut from 7 on 1 October 2026 (the recipient can
 * extend it back to 7 in PostNord's app). The reminder copy says 3, and the
 * poller's default offsets are day 1 and day 2. Reminders pitched at the old
 * 7-day window would arrive after the parcel had already been sent back to us.
 */

import nodemailer from "nodemailer";
import { postNordTrackingUrl } from "@repo/shipping";
import { resolveActiveDesign, renderDesign } from "./email-designed.js";
import type { MergeValues } from "./email-merge-tags.js";
import {
  getMailConfig,
  isCustomerEmailEnabled,
  getOrderEmailLogoUrl,
  orderEmailHeaderBrandInner,
  escapeHtml,
  SHOP_CONTACT_EMAIL,
} from "./email.js";

/** The two languages every customer-facing mail exists in. */
export type LocaleCode = "sv" | "en";

export type ShippingNoticeKind =
  | "ready_for_pickup"
  | "pickup_reminder_1"
  | "pickup_reminder_2"
  | "order_delivered"
  | "core_return_reminder";

export type ShippingNoticeData = {
  firstName: string;
  email: string;
  orderNumber: string;
  /** Absent for the core-return reminder, which is about a parcel going the other way. */
  trackingId?: string | null;
  servicePointName?: string | null;
  servicePointStreet?: string | null;
  servicePointPostalCode?: string | null;
  servicePointCity?: string | null;
  /** Set when the order still owes us the old turbo, so delivery can mention it. */
  coreReturnDeadline?: Date | null;
  locale?: "sv" | "en";
};

export type ShippingNoticeResult = {
  sent: boolean;
  recipient?: string;
  /** Set when configuration declined the send; not a failure. */
  skipped?: string;
};

/* ------------------------------------------------------------------ *
 * Copy
 * ------------------------------------------------------------------ */

type Copy = {
  subject: string;
  heading: string;
  lead: string;
  cta: string;
  note?: string;
  badge: string;
  /** Background of the badge circle. */
  badgeBg: string;
  /** Accent for the CTA button. */
  accent: string;
};

export const SHIPPING_NOTICE_COPY: Record<ShippingNoticeKind, Record<"sv" | "en", Copy>> = {
  ready_for_pickup: {
    sv: {
      subject: "Ditt paket finns att hämta",
      heading: "Ditt paket väntar på dig",
      lead: "Paketet har kommit fram till ditt ombud och går att hämta nu. Ta med legitimation.",
      cta: "Se försändelsen hos PostNord",
      note: "PostNord sparar paketet i 3 dagar. Behöver du mer tid kan du förlänga till 7 dagar i PostNords app — annars skickas paketet tillbaka till oss.",
      badge: "📍",
      badgeBg: "#dcfce7",
      accent: "#16a34a",
    },
    en: {
      subject: "Your parcel is ready for collection",
      heading: "Your parcel is waiting for you",
      lead: "It has arrived at your pickup point and can be collected now. Bring photo ID.",
      cta: "View the shipment at PostNord",
      note: "PostNord holds the parcel for 3 days. You can extend that to 7 days in the PostNord app — otherwise it is returned to us.",
      badge: "📍",
      badgeBg: "#dcfce7",
      accent: "#16a34a",
    },
  },
  pickup_reminder_1: {
    sv: {
      subject: "Påminnelse: hämta ditt paket",
      heading: "Glöm inte ditt paket",
      lead: "Ditt paket ligger kvar hos ombudet. Hämta det gärna de närmaste dagarna.",
      cta: "Se försändelsen hos PostNord",
      note: "Om paketet inte hämtas skickas det tillbaka till oss, och vi måste då ta ut en fraktavgift för att skicka det igen.",
      badge: "⏰",
      badgeBg: "#fef3c7",
      accent: "#d97706",
    },
    en: {
      subject: "Reminder: collect your parcel",
      heading: "Don't forget your parcel",
      lead: "Your parcel is still waiting at the pickup point. Please collect it in the next few days.",
      cta: "View the shipment at PostNord",
      note: "Uncollected parcels are returned to us, and sending one out again means a new shipping charge.",
      badge: "⏰",
      badgeBg: "#fef3c7",
      accent: "#d97706",
    },
  },
  pickup_reminder_2: {
    sv: {
      subject: "Sista chansen att hämta ditt paket",
      heading: "Ditt paket skickas snart tillbaka",
      lead: "Paketet ligger fortfarande kvar hos ombudet och är på väg att returneras till oss.",
      cta: "Se försändelsen hos PostNord",
      note: "Hinner du inte hämta i tid kan du förlänga liggetiden i PostNords app. Kontakta oss om något har blivit fel.",
      badge: "⚠️",
      badgeBg: "#fee2e2",
      accent: "#dc2626",
    },
    en: {
      subject: "Last chance to collect your parcel",
      heading: "Your parcel is about to be returned",
      lead: "It is still at the pickup point and is close to being sent back to us.",
      cta: "View the shipment at PostNord",
      note: "If you cannot collect it in time you can extend the holding period in the PostNord app. Contact us if something has gone wrong.",
      badge: "⚠️",
      badgeBg: "#fee2e2",
      accent: "#dc2626",
    },
  },
  core_return_reminder: {
    sv: {
      subject: "Påminnelse: skicka tillbaka din gamla turbo",
      heading: "Dags att skicka tillbaka kärnan",
      lead: "Du valde att returnera din gamla turbo inom 14 dagar. Deadline närmar sig — skicka den gärna de närmaste dagarna.",
      cta: "Kontakta oss om returen",
      note: "Om den gamla turbon inte kommer in i tid kan vi behöva fakturera 1\u00a0000 kr enligt köpvillkoren. Hör av dig om du behöver mer tid eller hjälp med frakten.",
      badge: "🔄",
      badgeBg: "#fef3c7",
      accent: "#d97706",
    },
    en: {
      subject: "Reminder: send back your old turbo",
      heading: "Time to return the core",
      lead: "You chose to return your old turbo within 14 days. The deadline is approaching — please send it in the next few days.",
      cta: "Contact us about the return",
      note: "If the old turbo does not arrive in time we may have to invoice 1,000 SEK under the terms of sale. Get in touch if you need more time or help with shipping.",
      badge: "🔄",
      badgeBg: "#fef3c7",
      accent: "#d97706",
    },
  },
  order_delivered: {
    sv: {
      subject: "Ditt paket är levererat",
      heading: "Tack för din beställning!",
      lead: "PostNord har registrerat din försändelse som levererad. Vi hoppas att allt ser bra ut.",
      cta: "Se leveransen hos PostNord",
      badge: "✅",
      badgeBg: "#dcfce7",
      accent: "#16a34a",
    },
    en: {
      subject: "Your parcel has been delivered",
      heading: "Thank you for your order!",
      lead: "PostNord has registered your shipment as delivered. We hope everything looks good.",
      cta: "View the delivery at PostNord",
      badge: "✅",
      badgeBg: "#dcfce7",
      accent: "#16a34a",
    },
  },
};

export type Labels = (typeof SHIPPING_NOTICE_LABELS)[LocaleCode];

export const SHIPPING_NOTICE_LABELS = {
  sv: {
    greeting: "Hej",
    orderNumber: "Ordernummer",
    trackingNumber: "Spårningsnummer",
    pickupPoint: "Hämtas hos",
    deadline: "Senast",
    coreHeading: "Glöm inte kärnreturen",
    coreBody: (date: string) =>
      `Skicka tillbaka din gamla turbo senast ${date}. Vid utebliven retur kan 1&nbsp;000 kr faktureras enligt köpvillkoren.`,
    questions: "Har du frågor? Kontakta oss på",
    rights: "Alla rättigheter förbehållna.",
  },
  en: {
    greeting: "Hi",
    orderNumber: "Order number",
    trackingNumber: "Tracking number",
    pickupPoint: "Collect at",
    deadline: "Due by",
    coreHeading: "Don't forget the core return",
    coreBody: (date: string) =>
      `Please send your old turbo back by ${date}. If it is not returned, 1,000 SEK may be invoiced under the terms of sale.`,
    questions: "Questions? Contact us at",
    rights: "All rights reserved.",
  },
};

/* ------------------------------------------------------------------ *
 * Shell
 * ------------------------------------------------------------------ */

function infoRow(label: string, value: string, accent?: string): string {
  return `
                    <p style="margin: 0 0 6px 0; font-size: 13px; color: #6b7280;">${label}</p>
                    <p style="margin: 0 0 16px 0; font-weight: 600; color: ${accent ?? "#111827"}; font-size: 16px;">${value}</p>`;
}

/**
 * `copy` and `labels` let the caller pass admin-edited text in. Both default
 * to the built-in objects, so every existing caller — and the preview, and the
 * verification harness — keeps rendering exactly what it did before.
 */
export function renderShippingNoticeEmail(
  kind: ShippingNoticeKind,
  data: ShippingNoticeData,
  copy?: Copy,
  labels?: Labels,
): string {
  const locale = data.locale === "en" ? "en" : "sv";
  const copyForKind = SHIPPING_NOTICE_COPY[kind];
  const t = copy ?? copyForKind[locale];
  const l = labels ?? SHIPPING_NOTICE_LABELS[locale];
  const logoUrl = getOrderEmailLogoUrl();
  const headerBrandInner = orderEmailHeaderBrandInner(logoUrl);
  const tracking = (data.trackingId ?? "").trim();
  const trackingUrl = tracking ? postNordTrackingUrl(tracking, locale) : "";
  const orderNo = escapeHtml(
    String(data.orderNumber).replace(/^#+/u, "").trim() || data.orderNumber,
  );

  const servicePoint = [
    data.servicePointName,
    [data.servicePointStreet, [data.servicePointPostalCode, data.servicePointCity].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", "),
  ]
    .filter((p) => p != null && String(p).trim().length > 0)
    .map((p) => escapeHtml(String(p)))
    .join("<br>");

  // The pickup point is the actionable fact in the three collection mails.
  const showServicePoint =
    kind !== "order_delivered" && kind !== "core_return_reminder" && servicePoint.length > 0;

  /**
   * The core-return reminder is about a parcel travelling the other way, so it
   * carries a deadline instead of a tracking number, and mails the shop rather
   * than linking to PostNord.
   */
  const isCoreReturn = kind === "core_return_reminder";

  const coreBlock =
    kind === "order_delivered" && data.coreReturnDeadline != null
      ? `
          <tr>
            <td style="padding: 0 40px 28px 40px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;">
                <tr>
                  <td style="padding: 18px 22px;">
                    <p style="margin: 0 0 6px 0; font-weight: 600; color: #92400e; font-size: 15px;">${l.coreHeading}</p>
                    <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.5;">${l.coreBody(
                      escapeHtml(data.coreReturnDeadline.toISOString().slice(0, 10)),
                    )}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
      : "";

  return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.subject} - Turbomeck</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0" width="680" style="max-width: 680px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 32px 32px 12px 32px; text-align: center;">
              ${headerBrandInner}
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 40px 24px 40px; text-align: center;">
              <table cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" style="margin: 0 auto;">
                <tr>
                  <td style="padding: 0; text-align: center;">
                    <table cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" style="margin: 0 auto; border-radius: 9999px; overflow: hidden; background-color: ${t.badgeBg};">
                      <tr>
                        <td width="56" height="56" style="width: 56px; height: 56px; max-width: 56px; max-height: 56px; background-color: ${t.badgeBg}; border-radius: 9999px; -webkit-border-radius: 9999px; text-align: center; vertical-align: middle; line-height: 56px; mso-line-height-rule: exactly;">
                          <span style="font-size: 26px; line-height: 56px; display: inline-block; vertical-align: middle;">${t.badge}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <h2 style="margin: 20px 0 12px 0; font-size: 22px; font-weight: 700; color: #111827;">${t.heading}</h2>
              <p style="margin: 0 0 8px 0; color: #111827; font-size: 15px;">${l.greeting} ${escapeHtml(data.firstName)},</p>
              <p style="margin: 0; color: #6b7280; font-size: 15px; line-height: 1.55;">${t.lead}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 28px 40px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px;">
                <tr>
                  <td style="padding: 22px;">
${showServicePoint ? infoRow(l.pickupPoint, servicePoint, "#111827") : ""}
${infoRow(l.orderNumber, `#${orderNo}`)}
${
  isCoreReturn
    ? data.coreReturnDeadline
      ? infoRow(l.deadline, escapeHtml(data.coreReturnDeadline.toISOString().slice(0, 10)), "#b45309")
      : ""
    : tracking
      ? infoRow(l.trackingNumber, escapeHtml(tracking), "#1e40af")
      : ""
}
                    <a href="${
                      isCoreReturn || !trackingUrl ? `mailto:${SHOP_CONTACT_EMAIL}` : trackingUrl
                    }" target="_blank" style="display: inline-block; background-color: ${t.accent}; color: #ffffff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">${t.cta} →</a>
${t.note ? `                    <p style="margin: 16px 0 0 0; font-size: 12px; color: #6b7280; line-height: 1.45;">${t.note}</p>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>${coreBlock}
          <tr>
            <td style="background-color: #f9fafb; padding: 22px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;">
                ${l.questions} <a href="mailto:${SHOP_CONTACT_EMAIL}" style="color: #6ec900; text-decoration: none;">${SHOP_CONTACT_EMAIL}</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} Turbomeck. ${l.rights}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/* ------------------------------------------------------------------ *
 * Send
 * ------------------------------------------------------------------ */


/**
 * The merge values a shipping-notice design can draw on.
 *
 * Only scalars: these notices carry no order lines, so none of the block
 * tokens apply. A design that uses one anyway gets an empty string rather
 * than a stray `{{order_items}}` in the customer's inbox.
 */
export function shippingNoticeMergeValues(
  data: ShippingNoticeData,
  locale: LocaleCode,
  orderNo: string,
): MergeValues {
  /**
   * Built from the parts rather than one stored string, and joined only on
   * the parts that exist — an order with a named service point but no street
   * must not render a leading comma.
   */
  const servicePointAddress = [
    data.servicePointStreet,
    [data.servicePointPostalCode, data.servicePointCity].filter(Boolean).join(" ").trim(),
  ]
    .filter((p) => p && String(p).trim())
    .join(", ");

  return {
    scalars: {
      customer_first_name: data.firstName ?? "",
      customer_email: data.email ?? "",
      order_number: orderNo,
      service_point: data.servicePointName ?? "",
      service_point_address: servicePointAddress,
      tracking_number: data.trackingId ?? "",
      tracking_url: data.trackingId ? postNordTrackingUrl(data.trackingId) : "",
      core_return_deadline: data.coreReturnDeadline
        ? new Date(data.coreReturnDeadline).toLocaleDateString(locale === "en" ? "en-GB" : "sv-SE")
        : "",
    },
    blocks: { order_items: "", order_totals: "", next_steps: "" },
  };
}

export async function sendShippingNoticeEmail(
  kind: ShippingNoticeKind,
  data: ShippingNoticeData,
): Promise<ShippingNoticeResult> {
  if (!(await isCustomerEmailEnabled(kind))) {
    return { sent: false, skipped: `${kind} is disabled in mail settings` };
  }

  const config = await getMailConfig();
  if (!config) {
    return { sent: false, skipped: "no mail configuration" };
  }

  const locale: LocaleCode = data.locale === "en" ? "en" : "sv";

  /**
   * The compiled copy, used directly. The field-by-field override layer that
   * used to sit here is gone: customising an email is now done by building a
   * design for it, so there is exactly one place wording can come from other
   * than the code — and that place is visible in the admin UI.
   */
  const t = SHIPPING_NOTICE_COPY[kind][locale];
  const l = SHIPPING_NOTICE_LABELS[locale];
  const orderNo = String(data.orderNumber).replace(/^#+/u, "").trim() || data.orderNumber;

  const skipTlsVerify = process.env.SMTP_REJECT_UNAUTHORIZED === "false";
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    tls: skipTlsVerify
      ? { rejectUnauthorized: false, checkServerIdentity: () => undefined }
      : {},
  });

  /**
   * Throws rather than returning false on a transport error. The caller holds a
   * ledger claim that is only confirmed on success, so a thrown error leaves a
   * retryable claim — returning false here would be indistinguishable from
   * "switched off" and would quietly drop the mail.
   */
  /**
   * An admin-built design replaces the compiled notice when one is active for
   * this kind and locale. Same rule as the order confirmation: no design, an
   * empty body or an empty subject all fall through to the compiled template,
   * so a half-finished design can never send a blank mail.
   */
  let subject = `${t.subject} (#${orderNo}) - Turbomeck`;
  let html = renderShippingNoticeEmail(kind, data, t, l);

  const activeDesign = await resolveActiveDesign(kind, locale);
  if (activeDesign) {
    const rendered = renderDesign(
      activeDesign,
      shippingNoticeMergeValues(data, locale, orderNo),
      kind,
    );
    if (rendered) {
      subject = rendered.subject;
      html = rendered.html;
    } else {
      console.warn(
        `[email] ${kind} design #${activeDesign.id} was unusable; sent the built-in template`,
      );
    }
  }

  await transporter.sendMail({
    from: `"Turbomeck" <${config.from}>`,
    to: data.email,
    subject,
    html,
  });

  console.log(`[email] ${kind} sent to ${data.email} order ${data.orderNumber}`);
  return { sent: true, recipient: data.email };
}
