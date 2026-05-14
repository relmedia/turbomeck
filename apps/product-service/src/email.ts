import nodemailer from "nodemailer";
import { db, appSettings } from "@repo/database";
import { eq } from "drizzle-orm";

/** Customer-facing contact address in transactional emails */
export const SHOP_CONTACT_EMAIL = "shop@turbomeck.se";

/**
 * Identical to @repo/auth `email-templates.ts` (magic link) LOGO_URL resolution.
 */
function getOrderEmailLogoUrl(): string {
  const env = process.env;
  if (env.EMAIL_LOGO_URL) return env.EMAIL_LOGO_URL;
  const r2Base = (env.R2_PUBLIC_URL || env.NEXT_PUBLIC_R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (r2Base) return `${r2Base}/branding/logo.png`;
  const appBase = (env.NEXT_PUBLIC_APP_URL || env.NEXTAUTH_URL || "").replace(/\/$/, "");
  if (appBase) return `${appBase}/logo.png`;
  return "";
}

/**
 * Order confirmation email header: logo + wordmark (or “T” fallback), horizontally centered (email-safe tables).
 */
function orderEmailHeaderBrandInner(logoUrl: string): string {
  return logoUrl
    ? `
                    <table role="presentation" align="center" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 14px;">
                          <img src="${logoUrl}" alt="Turbomeck" width="35" height="35" style="display: block; width: 35px; height: 35px;" />
                        </td>
                        <td style="vertical-align: middle;">
                          <span style="font-size: 24px; font-weight: 700; font-style: italic; letter-spacing: 0.08em;"><span style="color: #66CC33;">TURBO</span><span style="color: #334466;">MECK</span></span>
                        </td>
                      </tr>
                    </table>`
    : `
                    <table role="presentation" align="center" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                      <tr>
                        <td style="padding: 8px; background: rgba(255,255,255,0.2); border-radius: 50%; width: 56px; height: 56px; text-align: center; vertical-align: middle;">
                          <span style="font-size: 28px; font-weight: 800; color: #ffffff; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">T</span>
                        </td>
                        <td style="vertical-align: middle; padding-left: 14px;">
                          <span style="font-size: 24px; font-weight: 700; font-style: italic; letter-spacing: 0.08em;"><span style="color: #66CC33;">TURBO</span><span style="color: #334466;">MECK</span></span>
                        </td>
                      </tr>
                    </table>`;
}

/** 25 % moms inkluderad i bruttopris: moms = brutto × 25/125 */
function vatFromGrossIncl25(grossSek: number): number {
  return Math.round(Number(grossSek) * 0.2);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Mail clients need absolute https URLs. Relative paths use R2 public base from env.
 */
function toAbsoluteProductImageUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (t.startsWith("https://") || t.startsWith("http://")) return t;
  if (t.startsWith("//")) return `https:${t}`;
  const base = (process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!base) return null;
  const path = t.startsWith("/") ? t : `/${t}`;
  return `${base}${path}`;
}

function isLocalhostUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
}

/**
 * Many email clients do not render AVIF/WebP in <img>. Optionally route through product-service
 * JPEG proxy when EMAIL_IMAGE_PROXY_BASE_URL or PRODUCT_SERVICE_PUBLIC_URL is a public https URL.
 */
export function resolveProductImageUrlForEmail(raw: string | null | undefined): string | null {
  const absolute = toAbsoluteProductImageUrl(raw);
  if (!absolute) return null;
  const needsRasterFallback = /\.(avif|webp)(\?|#|$)/i.test(absolute);
  const proxyBase = (
    process.env.EMAIL_IMAGE_PROXY_BASE_URL ||
    process.env.PRODUCT_SERVICE_PUBLIC_URL ||
    ""
  ).replace(/\/$/, "");
  const proxyOk =
    !!proxyBase &&
    proxyBase.startsWith("https://") &&
    !isLocalhostUrl(proxyBase) &&
    !isLocalhostUrl(absolute);
  if (needsRasterFallback && proxyOk) {
    return `${proxyBase}/api/email/img?u=${encodeURIComponent(absolute)}`;
  }
  return absolute;
}

export type AdminEventKey =
  | "newOrder"
  | "newReview"
  | "userDeleted"
  | "shipmentBooked";

type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  /** Comma/space/newline-separated recipients for admin alerts. */
  adminNotificationEmails?: string;
  /** Master switch for admin notifications. Defaults to true if absent. */
  adminNotificationsEnabled?: boolean;
  /** Per-event toggles. Each key defaults to true if absent. */
  adminNotifications?: Partial<Record<AdminEventKey, boolean>>;
};

/**
 * An admin event mails only when both the master switch and the per-event
 * key allow it. Both default to true so an unconfigured DB row keeps the
 * historic always-on behavior for the order-confirmation flow.
 */
function isAdminEventEnabled(config: MailConfig, key: AdminEventKey): boolean {
  if (config.adminNotificationsEnabled === false) return false;
  const flag = config.adminNotifications?.[key];
  return flag !== false;
}

/**
 * Parse the raw admin-notifications field (comma/whitespace separated)
 * into a clean list of unique addresses that look like emails.
 */
function parseAdminNotificationRecipients(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const set = new Set<string>();
  for (const part of String(raw).split(/[\s,;]+/u)) {
    const trimmed = part.trim();
    if (trimmed.includes("@")) set.add(trimmed);
  }
  return [...set];
}

function getMailConfigFromEnv(): MailConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number.parseInt(process.env.SMTP_PORT || "587", 10);
  const secure =
    process.env.SMTP_SECURE === "true" ||
    process.env.SMTP_SECURE === "1" ||
    process.env.SMTP_SECURE === "yes";
  const user = process.env.SMTP_USER?.trim() ?? "";
  const password = process.env.SMTP_PASSWORD?.trim() ?? "";
  const from = process.env.MAIL_FROM?.trim() || user || "noreply@turbomeck.se";
  return { host, port: Number.isFinite(port) ? port : 587, secure, user, password, from };
}

async function getMailConfig(): Promise<MailConfig | null> {
  try {
    const [row] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "mail"))
      .limit(1);
    if (row?.value) {
      const parsed = JSON.parse(row.value) as MailConfig;
      if (parsed.host?.trim()) return parsed;
    }
  } catch {
    /* fall through */
  }
  const envCfg = getMailConfigFromEnv();
  if (!envCfg) return null;
  return {
    ...envCfg,
    adminNotificationEmails: process.env.ADMIN_NOTIFICATION_EMAILS ?? "",
  };
}

type OrderEmailData = {
  orderNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  servicePointName?: string | null;
  deliveryOption?: string | null;
  subtotal: number;
  shippingCost: number;
  discount: number;
  total: number;
  trackingId?: string | null;
  locale?: "sv" | "en";
  /** Human-readable payment method (e.g. "Visa •••• 4242") or free-order message */
  paymentMethodDisplay: string;
  items: Array<{
    productName: string;
    productImage?: string | null;
    variant?: string | null;
    price: number;
    quantity: number;
  }>;
};

const translations = {
  sv: {
    title: "Orderbekräftelse",
    thankYou: "Tack för din beställning!",
    orderReceived: "Vi har mottagit din order och börjar behandla den direkt.",
    welcomeGreeting: "Hej och tack för din order.",
    welcomeReview: "Granska ordersammanställning och leveranssätt nedan.",
    welcomeAccount:
      "På Mina sidor får du en mer detaljerad översikt. Du får ett mejl när ordern skickas från oss.",
    welcomeReply:
      "Har du frågor kan du ställa dem genom att svara på detta mejl. Vi gör vårt bästa för att svara dig snabbt.",
    welcomeThanks: "Tack för att du handlar hos oss!",
    welcomeSignoff: "Vänliga hälsningar,",
    welcomeSignature: "Turbomeck.se",
    orderNumber: "Ordernummer",
    date: "Datum",
    trackDelivery: "Spåra din leverans",
    trackingNumber: "Spårningsnummer",
    trackAtPostNord: "Spåra hos PostNord",
    trackingInitialStatusNote:
      "Spårningsnumret skapas direkt när försändelsen bokas, men PostNord kan visa \"ej hittad\" eller begränsad status tills paketet scannats första gången — det är vanligt. Spårningen uppdateras när säljaren lämnar in paketet.",
    orderedProducts: "Beställda produkter",
    quantity: "Antal",
    subtotal: "Delsumma",
    shipping: "Frakt",
    free: "Gratis",
    discount: "Rabatt",
    vatIncluded: "Varav moms (25%)",
    lineVat: "Varav moms (25 %)",
    total: "Totalt",
    shippingAddress: "Leveransadress",
    servicePoint: "Utlämningsställe",
    questions: "Har du frågor? Kontakta oss på",
    rights: "Alla rättigheter förbehållna.",
    sweden: "Sverige",
    norway: "Norge",
    paymentMethod: "Betalningsmetod",
  },
  en: {
    title: "Order Confirmation",
    thankYou: "Thank you for your order!",
    orderReceived: "We have received your order and will start processing it immediately.",
    welcomeGreeting: "Hi and thank you for your order.",
    welcomeReview: "Please review the order summary and delivery method below.",
    welcomeAccount:
      "In My Account you'll find a more detailed overview. You'll receive an email when the order ships from us.",
    welcomeReply:
      "If you have any questions, just reply to this email. We'll do our best to answer you quickly.",
    welcomeThanks: "Thank you for shopping with us!",
    welcomeSignoff: "Best regards,",
    welcomeSignature: "Turbomeck.se",
    orderNumber: "Order Number",
    date: "Date",
    trackDelivery: "Track your delivery",
    trackingNumber: "Tracking number",
    trackAtPostNord: "Track at PostNord",
    trackingInitialStatusNote:
      "Your tracking number is created when the shipment is booked, but PostNord may show \"not found\" or limited status until the parcel is first scanned — that is normal.",
    orderedProducts: "Ordered Products",
    quantity: "Qty",
    subtotal: "Subtotal",
    shipping: "Shipping",
    free: "Free",
    discount: "Discount",
    vatIncluded: "Incl. VAT (25%)",
    lineVat: "Of which VAT (25%)",
    total: "Total",
    shippingAddress: "Shipping Address",
    servicePoint: "Pickup Point",
    questions: "Questions? Contact us at",
    rights: "All rights reserved.",
    sweden: "Sweden",
    norway: "Norway",
    paymentMethod: "Payment method",
  },
};

function getCountryName(code: string, locale: "sv" | "en"): string {
  const t = translations[locale];
  if (code === "SE") return t.sweden;
  if (code === "NO") return t.norway;
  return code;
}

function renderOrderConfirmationEmail(data: OrderEmailData): string {
  const locale = data.locale || "sv";
  const t = translations[locale];
  const dateLocale = locale === "en" ? "en-GB" : "sv-SE";
  const logoUrl = getOrderEmailLogoUrl();

  const trackingUrl = data.trackingId
    ? `https://www.postnord.se/vara-verktyg/spara-din-forsandelse?shipmentId=${encodeURIComponent(data.trackingId)}`
    : null;

  // 25 % VAT included in prices (Swedish B2C): VAT share of gross = 20 %
  const vatAmount = vatFromGrossIncl25(data.total);

  // SECURITY: every dynamic field interpolated into the HTML below MUST be
  // escaped. Order data flows in from product names (admin-controlled today
  // but could be seller-submitted tomorrow), customer shipping fields (raw
  // user input), and PostNord servicePointName/trackingId. Without escaping
  // a stray `<` or `&` either breaks rendering or — worse — turns into
  // active HTML in mail clients that don't strictly sanitize.
  const safe = {
    orderNumber: escapeHtml(String(data.orderNumber ?? "")),
    paymentMethodDisplay: escapeHtml(data.paymentMethodDisplay ?? ""),
    trackingId: data.trackingId ? escapeHtml(data.trackingId) : "",
    firstName: escapeHtml(data.firstName ?? ""),
    lastName: escapeHtml(data.lastName ?? ""),
    address: escapeHtml(data.address ?? ""),
    postalCode: escapeHtml(data.postalCode ?? ""),
    city: escapeHtml(data.city ?? ""),
    country: escapeHtml(getCountryName(data.country, locale)),
    servicePointName: data.servicePointName ? escapeHtml(data.servicePointName) : "",
  };

  const itemsHtml = data.items
    .map(
      (item) => {
        const lineGross = item.price * item.quantity;
        const lineVat = vatFromGrossIncl25(lineGross);
        const imgSrc = resolveProductImageUrlForEmail(item.productImage);
        const imgAttr = imgSrc ? escapeHtmlAttr(imgSrc) : "";
        const productName = escapeHtml(item.productName ?? "");
        const variant = item.variant ? escapeHtml(item.variant) : "";
        return `
      <tr>
        <td style="padding: 16px 0; border-bottom: 1px solid #e5e7eb;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td width="80" style="vertical-align: top;">
                ${
                  imgSrc
                    ? `<img src="${imgAttr}" alt="${productName}" width="64" height="64" style="display: block; width: 64px; height: 64px; border-radius: 8px; object-fit: cover; background: #f3f4f6;" />`
                    : `<div style="width: 64px; height: 64px; background: #f3f4f6; border-radius: 8px;"></div>`
                }
              </td>
              <td style="vertical-align: top; padding-left: 12px;">
                <p style="margin: 0 0 4px 0; font-weight: 600; color: #111827;">${productName}</p>
                ${variant ? `<p style="margin: 0 0 4px 0; font-size: 13px; color: #6b7280;">${variant}</p>` : ""}
                <p style="margin: 0; font-size: 13px; color: #6b7280;">${t.quantity}: ${item.quantity}</p>
              </td>
              <td style="vertical-align: top; text-align: right; white-space: nowrap;">
                <p style="margin: 0; font-weight: 600; color: #111827;">${lineGross.toLocaleString(dateLocale)} kr</p>
                <p style="margin: 6px 0 0 0; font-size: 12px; color: #6b7280; line-height: 1.35;">${t.lineVat}<br/>${lineVat.toLocaleString(dateLocale)} kr</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
      },
    )
    .join("");

  const headerBrandInner = orderEmailHeaderBrandInner(logoUrl);

  return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.title} - Turbomeck</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          
          <!-- Header brand: same markup as magic-link mail (packages/auth email-templates baseWrapper header) -->
          <tr>
            <td style="background: linear-gradient(135deg, #111827 0%, #1f2937 100%); padding: 28px 32px; text-align: left;">
              ${headerBrandInner}
            </td>
          </tr>
          
          <!-- Success Banner (nested table + 9999px radius = “pill/circle” in Gmail/Apple; Outlook still may show square) -->
          <tr>
            <td style="padding: 40px 40px 24px 40px; text-align: center;">
              <table cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" style="margin: 0 auto;">
                <tr>
                  <td style="padding: 0; text-align: center;">
                    <table cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" style="margin: 0 auto; border-radius: 9999px; overflow: hidden; background-color: #dcfce7;">
                      <tr>
                        <td width="64" height="64" style="width: 64px; height: 64px; max-width: 64px; max-height: 64px; background-color: #dcfce7; border-radius: 9999px; -webkit-border-radius: 9999px; text-align: center; vertical-align: middle; mso-line-height-rule: exactly; line-height: 64px;">
                          <span style="font-size: 30px; color: #16a34a; line-height: 64px; display: inline-block; vertical-align: middle;">✓</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <h2 style="margin: 20px 0 8px 0; font-size: 24px; font-weight: 700; color: #111827;">${t.thankYou}</h2>
              <p style="margin: 0; color: #6b7280; font-size: 15px;">${t.orderReceived}</p>
            </td>
          </tr>

          <!-- Welcome message -->
          <tr>
            <td style="padding: 0 40px 24px 40px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px;">
                <tr>
                  <td style="padding: 22px 24px; color: #374151; font-size: 14px; line-height: 1.65;">
                    <p style="margin: 0 0 12px 0;">${t.welcomeGreeting}</p>
                    <p style="margin: 0 0 12px 0;">${t.welcomeReview}</p>
                    <p style="margin: 0 0 12px 0;">${t.welcomeAccount}</p>
                    <p style="margin: 0 0 12px 0;">${t.welcomeReply}</p>
                    <p style="margin: 0 0 16px 0; font-weight: 600; color: #111827;">${t.welcomeThanks}</p>
                    <p style="margin: 0; color: #6b7280;">
                      ${t.welcomeSignoff}<br/>
                      <span style="color: #111827; font-weight: 600;">${t.welcomeSignature}</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Order Info -->
          <tr>
            <td style="padding: 0 40px 24px 40px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;">
                    <table cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 0;">
                          <p style="margin: 0; font-size: 13px; color: #6b7280;">${t.orderNumber}</p>
                          <p style="margin: 4px 0 0 0; font-weight: 600; color: #111827; font-size: 16px;">${safe.orderNumber}</p>
                        </td>
                        <td style="padding: 0; text-align: right;">
                          <p style="margin: 0; font-size: 13px; color: #6b7280;">${t.date}</p>
                          <p style="margin: 4px 0 0 0; font-weight: 600; color: #111827;">${new Date().toLocaleDateString(dateLocale)}</p>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding: 16px 0 0 0; border-top: 1px solid #e5e7eb;">
                          <p style="margin: 0; font-size: 13px; color: #6b7280;">${t.paymentMethod}</p>
                          <p style="margin: 4px 0 0 0; font-weight: 600; color: #111827; font-size: 15px;">${safe.paymentMethodDisplay}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          ${
            trackingUrl
              ? `
          <!-- Tracking -->
          <tr>
            <td style="padding: 0 40px 24px 40px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #eff6ff; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px 0; font-weight: 600; color: #1e40af;">📦 ${t.trackDelivery}</p>
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: #3b82f6;">${t.trackingNumber}: ${safe.trackingId}</p>
                    <a href="${trackingUrl}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">${t.trackAtPostNord} →</a>
                    <p style="margin: 14px 0 0 0; font-size: 12px; color: #64748b; line-height: 1.45;">${t.trackingInitialStatusNote}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          `
              : ""
          }
          
          <!-- Items -->
          <tr>
            <td style="padding: 0 40px;">
              <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #111827;">${t.orderedProducts}</h3>
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                ${itemsHtml}
              </table>
            </td>
          </tr>
          
          <!-- Summary -->
          <tr>
            <td style="padding: 24px 40px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top: 2px solid #e5e7eb; padding-top: 16px;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">${t.subtotal}</td>
                  <td style="padding: 8px 0; text-align: right; color: #111827; font-size: 14px;">${data.subtotal.toLocaleString(dateLocale)} kr</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">${t.shipping}</td>
                  <td style="padding: 8px 0; text-align: right; color: #111827; font-size: 14px;">${data.shippingCost > 0 ? `${data.shippingCost.toLocaleString(dateLocale)} kr` : t.free}</td>
                </tr>
                ${
                  data.discount > 0
                    ? `
                <tr>
                  <td style="padding: 8px 0; color: #16a34a; font-size: 14px;">${t.discount}</td>
                  <td style="padding: 8px 0; text-align: right; color: #16a34a; font-size: 14px;">-${data.discount.toLocaleString(dateLocale)} kr</td>
                </tr>
                `
                    : ""
                }
                <tr>
                  <td colspan="2" style="padding: 12px 0 0 0; border-top: 1px solid #e5e7eb;"></td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; font-weight: 700; font-size: 18px; color: #111827;">${t.total}</td>
                  <td style="padding: 4px 0; text-align: right; font-weight: 700; font-size: 18px; color: #111827;">${data.total.toLocaleString(dateLocale)} kr</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 12px;">${t.vatIncluded} (${locale === "en" ? "order total" : "order totalt"})</td>
                  <td style="padding: 4px 0; text-align: right; color: #6b7280; font-size: 12px;">${vatAmount.toLocaleString(dateLocale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kr</td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Shipping Address -->
          <tr>
            <td style="padding: 0 40px 32px 40px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;">
                    <h4 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #111827;">${t.shippingAddress}</h4>
                    <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">
                      ${safe.firstName} ${safe.lastName}<br>
                      ${safe.address}<br>
                      ${safe.postalCode} ${safe.city}<br>
                      ${safe.country}
                      ${safe.servicePointName ? `<br><br><strong>${t.servicePoint}:</strong> ${safe.servicePointName}` : ""}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;">
                ${t.questions} <a href="mailto:${SHOP_CONTACT_EMAIL}" style="color: #6ec900; text-decoration: none;">${SHOP_CONTACT_EMAIL}</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} Turbomeck. ${t.rights}
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

// ——— Shipment dispatched (admin saved PostNord tracking) ———

type ShipmentDispatchedEmailData = {
  firstName: string;
  email: string;
  orderNumber: string;
  trackingId: string;
  locale?: "sv" | "en";
};

const shipmentDispatchedTranslations = {
  sv: {
    subject: "Din order har skickats",
    heading: "Ditt paket är på väg!",
    greeting: "Hej",
    lead: "Vi har skickat ditt paket från Turbomeck. Nedan hittar du PostNords spårningsnummer och en länk där du kan följa leveransen.",
    orderNumber: "Ordernummer",
    trackingNumber: "Spårningsnummer",
    trackCta: "Spåra försändelsen hos PostNord",
    note: 'PostNord kan visa "ej hittad" eller begränsad status tills paketet scannats första gången — det är vanligt.',
    questions: "Har du frågor? Kontakta oss på",
    rights: "Alla rättigheter förbehållna.",
  },
  en: {
    subject: "Your order has been shipped",
    heading: "Your package is on its way!",
    greeting: "Hi",
    lead: "We have dispatched your package from Turbomeck. Your PostNord tracking number and a link to follow the shipment are below.",
    orderNumber: "Order number",
    trackingNumber: "Tracking number",
    trackCta: "Track shipment at PostNord",
    note: 'PostNord may show "not found" or limited status until the parcel is first scanned — that is normal.',
    questions: "Questions? Contact us at",
    rights: "All rights reserved.",
  },
};

function renderShipmentDispatchedEmail(data: ShipmentDispatchedEmailData): string {
  const locale = data.locale === "en" ? "en" : "sv";
  const t = shipmentDispatchedTranslations[locale];
  const logoUrl = getOrderEmailLogoUrl();
  const headerBrandInner = orderEmailHeaderBrandInner(logoUrl);
  const trackingUrl = `https://www.postnord.se/vara-verktyg/spara-din-forsandelse?shipmentId=${encodeURIComponent(data.trackingId)}`;
  const orderNo = escapeHtml(String(data.orderNumber).replace(/^#+/u, "").trim() || data.orderNumber);
  const tracking = escapeHtml(data.trackingId);
  const firstName = escapeHtml(data.firstName);

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
        <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #111827 0%, #1f2937 100%); padding: 28px 32px; text-align: center;">
              ${headerBrandInner}
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 40px 24px 40px; text-align: center;">
              <table cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" style="margin: 0 auto;">
                <tr>
                  <td style="padding: 0; text-align: center;">
                    <table cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" style="margin: 0 auto; border-radius: 9999px; overflow: hidden; background-color: #dbeafe;">
                      <tr>
                        <td width="56" height="56" style="width: 56px; height: 56px; max-width: 56px; max-height: 56px; background-color: #dbeafe; border-radius: 9999px; -webkit-border-radius: 9999px; text-align: center; vertical-align: middle; line-height: 56px; mso-line-height-rule: exactly;">
                          <span style="font-size: 26px; line-height: 56px; display: inline-block; vertical-align: middle;">📦</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <h2 style="margin: 20px 0 12px 0; font-size: 22px; font-weight: 700; color: #111827;">${t.heading}</h2>
              <p style="margin: 0 0 8px 0; color: #111827; font-size: 15px;">${t.greeting} ${firstName},</p>
              <p style="margin: 0; color: #6b7280; font-size: 15px; line-height: 1.55;">${t.lead}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 28px 40px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px;">
                <tr>
                  <td style="padding: 22px;">
                    <p style="margin: 0 0 6px 0; font-size: 13px; color: #6b7280;">${t.orderNumber}</p>
                    <p style="margin: 0 0 16px 0; font-weight: 600; color: #111827; font-size: 17px;">#${orderNo}</p>
                    <p style="margin: 0 0 6px 0; font-size: 13px; color: #6b7280;">${t.trackingNumber}</p>
                    <p style="margin: 0 0 18px 0; font-weight: 600; color: #1e40af; font-size: 17px; letter-spacing: 0.02em;">${tracking}</p>
                    <a href="${trackingUrl}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">${t.trackCta} →</a>
                    <p style="margin: 16px 0 0 0; font-size: 12px; color: #6b7280; line-height: 1.45;">${t.note}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 22px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;">
                ${t.questions} <a href="mailto:${SHOP_CONTACT_EMAIL}" style="color: #6ec900; text-decoration: none;">${SHOP_CONTACT_EMAIL}</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} Turbomeck. ${t.rights}
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

export async function sendShipmentDispatchedEmail(data: ShipmentDispatchedEmailData): Promise<boolean> {
  const config = await getMailConfig();
  if (!config) {
    console.warn("[email] No mail config, skipping shipment-dispatched email");
    return false;
  }

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

  const locale = data.locale === "en" ? "en" : "sv";
  const t = shipmentDispatchedTranslations[locale];
  const html = renderShipmentDispatchedEmail(data);

  try {
    await transporter.sendMail({
      from: `"Turbomeck" <${config.from}>`,
      to: data.email,
      subject: `${t.subject} (#${String(data.orderNumber).replace(/^#+/u, "").trim() || data.orderNumber}) - Turbomeck`,
      html,
    });
    console.log(`[email] Shipment dispatched notice sent to ${data.email} order ${data.orderNumber}`);
    return true;
  } catch (error) {
    console.error("[email] Failed to send shipment-dispatched email:", error);
    return false;
  }
}

export async function sendOrderConfirmationEmail(data: OrderEmailData): Promise<boolean> {
  const config = await getMailConfig();
  if (!config) {
    console.warn("[email] No mail config found, skipping order confirmation email");
    return false;
  }

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

  const locale = data.locale || "sv";
  const t = translations[locale];
  const html = renderOrderConfirmationEmail(data);

  try {
    await transporter.sendMail({
      from: `"Turbomeck" <${config.from}>`,
      to: data.email,
      subject: `${t.title} ${data.orderNumber} - Turbomeck`,
      html,
    });
    console.log(`[email] Order confirmation sent to ${data.email} for ${data.orderNumber}`);
    return true;
  } catch (error) {
    console.error("[email] Failed to send order confirmation:", error);
    return false;
  }
}

// ——— Admin notification: a customer just placed an order ———

export type AdminNewOrderEmailData = {
  orderNumber: string;
  /** Internal order id (used to build the admin deep-link). */
  orderId: number | string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  servicePointName?: string | null;
  deliveryOption?: string | null;
  subtotal: number;
  shippingCost: number;
  discount: number;
  total: number;
  paymentMethodDisplay: string;
  items: Array<{
    productName: string;
    variant?: string | null;
    price: number;
    quantity: number;
  }>;
};

function renderAdminNewOrderEmail(data: AdminNewOrderEmailData): string {
  const adminBase = (
    process.env.NEXT_PUBLIC_ADMIN_URL ||
    process.env.ADMIN_URL ||
    ""
  ).replace(/\/$/u, "");
  const orderUrl = adminBase ? `${adminBase}/payments/${data.orderId}` : "";
  const logoUrl = getOrderEmailLogoUrl();

  const fullName = `${data.firstName} ${data.lastName}`.trim();
  const itemsText = data.items
    .map((it) => {
      const variant = it.variant ? ` (${escapeHtml(it.variant)})` : "";
      return `<tr>
        <td style="padding:6px 0;color:#111827;font-size:14px;">${escapeHtml(it.productName)}${variant}</td>
        <td style="padding:6px 0;color:#6b7280;font-size:14px;text-align:right;white-space:nowrap;">${it.quantity} × ${it.price.toLocaleString("sv-SE")} kr</td>
      </tr>`;
    })
    .join("");

  const addressBlock = [
    escapeHtml(fullName),
    escapeHtml(data.address),
    `${escapeHtml(data.postalCode)} ${escapeHtml(data.city)}`,
    escapeHtml(data.country || ""),
    data.servicePointName ? `Ombud: ${escapeHtml(data.servicePointName)}` : "",
  ]
    .filter(Boolean)
    .join("<br/>");

  return `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ny order ${escapeHtml(data.orderNumber)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
          <tr>
            <td style="background:#ffffff;border-bottom:1px solid #e5e7eb;padding:28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">
                <tr>
                  ${
                    logoUrl
                      ? `<td style="vertical-align:middle;padding-right:12px;">
                          <img src="${escapeHtmlAttr(logoUrl)}" alt="Turbomeck" width="32" height="32" style="display:block;width:32px;height:32px;border-radius:6px;" />
                        </td>`
                      : `<td style="vertical-align:middle;padding-right:12px;">
                          <span style="display:inline-block;width:32px;height:32px;border-radius:6px;background:#0f172a;color:#ffffff;font-weight:800;font-size:18px;line-height:32px;text-align:center;">T</span>
                        </td>`
                  }
                  <td style="vertical-align:middle;">
                    <span style="font-size:18px;font-weight:700;font-style:italic;letter-spacing:0.08em;"><span style="color:#66CC33;">TURBO</span><span style="color:#334466;">MECK</span></span>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:12px;font-weight:600;letter-spacing:0.12em;color:#6b7280;">TURBOMECK · STUDIO</p>
              <h1 style="margin:8px 0 0 0;font-size:22px;font-weight:700;color:#111827;">Ny order mottagen</h1>
              <p style="margin:10px 0 0 0;font-size:14px;color:#374151;line-height:1.55;">En kund har just slutfört ett köp. Sammanställningen och kunduppgifterna finns nedan – öppna ordern i Turbomeck studio för att hantera frakt och status.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px 32px;">
              <p style="margin:0 0 4px 0;font-size:14px;color:#6b7280;">Ordernummer</p>
              <p style="margin:0 0 16px 0;font-size:18px;font-weight:600;color:#111827;">${escapeHtml(data.orderNumber)}</p>
              <p style="margin:0 0 4px 0;font-size:14px;color:#6b7280;">Kund</p>
              <p style="margin:0 0 4px 0;font-size:15px;color:#111827;">${escapeHtml(fullName) || "—"}</p>
              <p style="margin:0 0 4px 0;font-size:14px;color:#374151;">
                <a href="mailto:${escapeHtmlAttr(data.email)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(data.email)}</a>
              </p>
              ${
                data.phone
                  ? `<p style="margin:0 0 16px 0;font-size:14px;color:#374151;">${escapeHtml(data.phone)}</p>`
                  : `<p style="margin:0 0 16px 0;"></p>`
              }
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:8px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Produkter</p>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${itemsText}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:6px 0;color:#6b7280;font-size:14px;">Delsumma</td>
                  <td style="padding:6px 0;color:#111827;font-size:14px;text-align:right;">${data.subtotal.toLocaleString("sv-SE")} kr</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#6b7280;font-size:14px;">Frakt</td>
                  <td style="padding:6px 0;color:#111827;font-size:14px;text-align:right;">${data.shippingCost > 0 ? `${data.shippingCost.toLocaleString("sv-SE")} kr` : "Gratis"}</td>
                </tr>
                ${
                  data.discount > 0
                    ? `<tr>
                        <td style="padding:6px 0;color:#16a34a;font-size:14px;">Rabatt</td>
                        <td style="padding:6px 0;color:#16a34a;font-size:14px;text-align:right;">-${data.discount.toLocaleString("sv-SE")} kr</td>
                      </tr>`
                    : ""
                }
                <tr>
                  <td colspan="2" style="padding:8px 0 0 0;border-top:1px solid #e5e7eb;"></td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#111827;font-size:16px;font-weight:700;">Totalt</td>
                  <td style="padding:8px 0;color:#111827;font-size:16px;font-weight:700;text-align:right;">${data.total.toLocaleString("sv-SE")} kr</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 20px 32px;">
              <p style="margin:0 0 4px 0;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Betalning</p>
              <p style="margin:0 0 16px 0;font-size:14px;color:#111827;">${escapeHtml(data.paymentMethodDisplay)}</p>
              <p style="margin:0 0 4px 0;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Leveransadress</p>
              <p style="margin:0 0 16px 0;font-size:14px;color:#111827;line-height:1.55;">${addressBlock || "—"}</p>
            </td>
          </tr>
          ${
            orderUrl
              ? `<tr>
                  <td style="padding:0 32px 28px 32px;">
                    <a href="${escapeHtmlAttr(orderUrl)}" style="display:inline-block;background:#111827;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Öppna ordern i Turbomeck Studio →</a>
                  </td>
                </tr>`
              : ""
          }
          <tr>
            <td style="background:#f9fafb;padding:18px 32px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">Detta är ett internt admin-meddelande från Turbomeck. © ${new Date().getFullYear()}</p>
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

/**
 * Notifies every configured admin recipient that a customer just placed an order.
 * Recipients come from `app_settings.mail.adminNotificationEmails`
 * (or env `ADMIN_NOTIFICATION_EMAILS` if the DB row is absent).
 * Silently no-ops when no recipients or SMTP config exist.
 */
export async function sendAdminNewOrderEmail(data: AdminNewOrderEmailData): Promise<boolean> {
  const config = await getMailConfig();
  if (!config) {
    console.warn("[email] No mail config, skipping admin new-order notification");
    return false;
  }
  if (!isAdminEventEnabled(config, "newOrder")) {
    return false;
  }
  const recipients = parseAdminNotificationRecipients(config.adminNotificationEmails);
  if (recipients.length === 0) {
    return false;
  }

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

  const html = renderAdminNewOrderEmail(data);
  const orderRef = String(data.orderNumber).replace(/^#+/u, "").trim() || data.orderNumber;
  const customer = `${data.firstName} ${data.lastName}`.trim() || data.email;

  try {
    await transporter.sendMail({
      from: `"Turbomeck Admin" <${config.from}>`,
      to: recipients.join(", "),
      subject: `Ny order #${orderRef} – ${customer} (${data.total.toLocaleString("sv-SE")} kr)`,
      html,
    });
    console.log(
      `[email] Admin new-order notice sent to ${recipients.join(", ")} for order ${data.orderNumber}`,
    );
    return true;
  } catch (error) {
    console.error("[email] Failed to send admin new-order notice:", error);
    return false;
  }
}

// ——— Shared admin-mail helpers ———

/**
 * Resolves the absolute base URL the admin app is reachable on, used to
 * build "open in admin" deep links inside admin-side emails. Falls back
 * to an empty string when no admin URL is configured; callers should
 * omit the CTA in that case.
 */
function getAdminBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ADMIN_URL ||
    process.env.ADMIN_URL ||
    ""
  ).replace(/\/$/u, "");
}

type AdminEmailLayoutOptions = {
  /** Small uppercase eyebrow above the heading. */
  eyebrow: string;
  /** Main heading shown in the dark header card. */
  heading: string;
  /** Body sections (already-rendered HTML strings, inserted in order). */
  sections: string[];
  /** Optional CTA at the bottom (label + absolute URL). */
  cta?: { label: string; url: string };
};

function renderAdminEmailLayout(opts: AdminEmailLayoutOptions): string {
  const sectionsHtml = opts.sections.join("\n");
  const logoUrl = getOrderEmailLogoUrl();
  const logoCell = logoUrl
    ? `<td style="vertical-align:middle;padding-right:12px;">
        <img src="${escapeHtmlAttr(logoUrl)}" alt="Turbomeck" width="32" height="32" style="display:block;width:32px;height:32px;border-radius:6px;" />
      </td>`
    : `<td style="vertical-align:middle;padding-right:12px;">
        <span style="display:inline-block;width:32px;height:32px;border-radius:6px;background:#0f172a;color:#ffffff;font-weight:800;font-size:18px;line-height:32px;text-align:center;">T</span>
      </td>`;
  const ctaHtml = opts.cta
    ? `<tr>
        <td style="padding:0 32px 28px 32px;">
          <a href="${escapeHtmlAttr(opts.cta.url)}" style="display:inline-block;background:#111827;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(opts.cta.label)} →</a>
        </td>
      </tr>`
    : "";

  return `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
          <tr>
            <td style="background:#ffffff;border-bottom:1px solid #e5e7eb;padding:28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">
                <tr>
                  ${logoCell}
                  <td style="vertical-align:middle;">
                    <span style="font-size:18px;font-weight:700;font-style:italic;letter-spacing:0.08em;"><span style="color:#66CC33;">TURBO</span><span style="color:#334466;">MECK</span></span>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:12px;font-weight:600;letter-spacing:0.12em;color:#6b7280;">TURBOMECK · STUDIO · ${escapeHtml(opts.eyebrow.toUpperCase())}</p>
              <h1 style="margin:8px 0 0 0;font-size:22px;font-weight:700;color:#111827;">${escapeHtml(opts.heading)}</h1>
            </td>
          </tr>
          ${sectionsHtml}
          ${ctaHtml}
          <tr>
            <td style="background:#f9fafb;padding:18px 32px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#6b7280;">Internt meddelande från Turbomeck Studio. © ${new Date().getFullYear()}</p>
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

function adminInfoSection(rows: Array<{ label: string; value: string }>): string {
  const trs = rows
    .map(
      (r) => `<tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;width:40%;vertical-align:top;">${escapeHtml(r.label)}</td>
        <td style="padding:8px 0;color:#111827;font-size:14px;">${r.value}</td>
      </tr>`,
    )
    .join("");
  return `<tr>
    <td style="padding:20px 32px 4px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">${trs}</table>
    </td>
  </tr>`;
}

function adminBlockSection(title: string, html: string): string {
  return `<tr>
    <td style="padding:8px 32px 16px 32px;">
      <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(title)}</p>
      <div style="font-size:14px;color:#111827;line-height:1.55;">${html}</div>
    </td>
  </tr>`;
}

async function buildAdminTransport(config: MailConfig) {
  const skipTlsVerify = process.env.SMTP_REJECT_UNAUTHORIZED === "false";
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    tls: skipTlsVerify
      ? { rejectUnauthorized: false, checkServerIdentity: () => undefined }
      : {},
  });
}

// ——— Admin notification: new review submitted ———

export type AdminNewReviewEmailData = {
  productId: number | string;
  productName: string;
  reviewId: number | string;
  reviewerName: string;
  reviewerEmail?: string | null;
  rating: number;
  title?: string | null;
  comment?: string | null;
  verifiedPurchase: boolean;
};

function ratingStars(rating: number): string {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  const filled = "★".repeat(r);
  const empty = "☆".repeat(5 - r);
  return `<span style="color:#f59e0b;font-size:16px;letter-spacing:1px;">${filled}<span style="color:#d1d5db;">${empty}</span></span>`;
}

function renderAdminNewReviewEmail(data: AdminNewReviewEmailData): string {
  const adminBase = getAdminBaseUrl();
  const reviewUrl = adminBase ? `${adminBase}/reviews` : "";

  const reviewerHtml = data.reviewerEmail
    ? `${escapeHtml(data.reviewerName)} · <a href="mailto:${escapeHtmlAttr(data.reviewerEmail)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(data.reviewerEmail)}</a>`
    : escapeHtml(data.reviewerName);

  const verifiedBadge = data.verifiedPurchase
    ? `<span style="display:inline-block;background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">Verifierat köp</span>`
    : `<span style="display:inline-block;background:#f3f4f6;color:#6b7280;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">Ej verifierat</span>`;

  const sections = [
    adminInfoSection([
      { label: "Produkt", value: escapeHtml(data.productName) },
      {
        label: "Betyg",
        value: `${ratingStars(data.rating)} <span style="color:#6b7280;">(${data.rating}/5)</span>`,
      },
      { label: "Recensent", value: reviewerHtml },
      { label: "Status", value: verifiedBadge },
    ]),
  ];

  if (data.title) {
    sections.push(
      adminBlockSection(
        "Rubrik",
        `<strong>${escapeHtml(data.title)}</strong>`,
      ),
    );
  }
  if (data.comment) {
    sections.push(
      adminBlockSection(
        "Kommentar",
        escapeHtml(data.comment).replace(/\n/g, "<br/>"),
      ),
    );
  }

  return renderAdminEmailLayout({
    eyebrow: "Ny review",
    heading: `Ny recension för ${data.productName}`,
    sections,
    ...(reviewUrl ? { cta: { label: "Hantera recensioner i Turbomeck Studio", url: reviewUrl } } : {}),
  });
}

export async function sendAdminNewReviewEmail(
  data: AdminNewReviewEmailData,
): Promise<boolean> {
  const config = await getMailConfig();
  if (!config) return false;
  if (!isAdminEventEnabled(config, "newReview")) return false;
  const recipients = parseAdminNotificationRecipients(config.adminNotificationEmails);
  if (recipients.length === 0) return false;

  const transporter = await buildAdminTransport(config);
  const html = renderAdminNewReviewEmail(data);

  try {
    await transporter.sendMail({
      from: `"Turbomeck Admin" <${config.from}>`,
      to: recipients.join(", "),
      subject: `Ny recension (${data.rating}/5) – ${data.productName}`,
      html,
    });
    console.log(
      `[email] Admin new-review notice sent to ${recipients.join(", ")} for review ${data.reviewId}`,
    );
    return true;
  } catch (error) {
    console.error("[email] Failed to send admin new-review notice:", error);
    return false;
  }
}

// ——— Admin notification: user account deleted ———

export type AdminUserDeletedEmailData = {
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  /** "self" = user deleted their own account; "admin" = an admin removed the user. */
  initiator: "self" | "admin";
  /** Display name/email of the admin who triggered the deletion (only when initiator === "admin"). */
  performedBy?: string | null;
};

function renderAdminUserDeletedEmail(data: AdminUserDeletedEmailData): string {
  const adminBase = getAdminBaseUrl();
  const usersUrl = adminBase ? `${adminBase}/users` : "";

  const initiatorLabel =
    data.initiator === "self"
      ? `<span style="display:inline-block;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">Självradering</span>`
      : `<span style="display:inline-block;background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">Borttagen av admin</span>`;

  const rows: Array<{ label: string; value: string }> = [
    { label: "Användar-ID", value: `<code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f3f4f6;padding:2px 6px;border-radius:4px;">${escapeHtml(data.userId)}</code>` },
    { label: "Status", value: initiatorLabel },
  ];
  if (data.userName) {
    rows.splice(1, 0, { label: "Namn", value: escapeHtml(data.userName) });
  }
  if (data.userEmail) {
    rows.push({
      label: "E-post",
      value: `<a href="mailto:${escapeHtmlAttr(data.userEmail)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(data.userEmail)}</a>`,
    });
  }
  if (data.initiator === "admin" && data.performedBy) {
    rows.push({ label: "Utförd av", value: escapeHtml(data.performedBy) });
  }

  const sections = [
    adminInfoSection(rows),
    adminBlockSection(
      "Vad har raderats?",
      "Användarens konto, sessioner och recensioner togs bort. Ordrar bevaras med användar-ID för historik och bokföring.",
    ),
  ];

  return renderAdminEmailLayout({
    eyebrow: "Användare raderad",
    heading:
      data.initiator === "self"
        ? "En användare har raderat sitt konto"
        : "Ett användarkonto har tagits bort",
    sections,
    ...(usersUrl ? { cta: { label: "Öppna användarlistan i Turbomeck Studio", url: usersUrl } } : {}),
  });
}

export async function sendAdminUserDeletedEmail(
  data: AdminUserDeletedEmailData,
): Promise<boolean> {
  const config = await getMailConfig();
  if (!config) return false;
  if (!isAdminEventEnabled(config, "userDeleted")) return false;
  const recipients = parseAdminNotificationRecipients(config.adminNotificationEmails);
  if (recipients.length === 0) return false;

  const transporter = await buildAdminTransport(config);
  const html = renderAdminUserDeletedEmail(data);
  const who = data.userName || data.userEmail || data.userId;
  const subjectPrefix =
    data.initiator === "self"
      ? "Användare raderade sitt konto"
      : "Användare borttagen";

  try {
    await transporter.sendMail({
      from: `"Turbomeck Admin" <${config.from}>`,
      to: recipients.join(", "),
      subject: `${subjectPrefix} – ${who}`,
      html,
    });
    console.log(
      `[email] Admin user-deleted notice sent to ${recipients.join(", ")} for user ${data.userId}`,
    );
    return true;
  } catch (error) {
    console.error("[email] Failed to send admin user-deleted notice:", error);
    return false;
  }
}

// ——— Admin notification: shipment booked / tracking generated ———

export type AdminShipmentBookedEmailData = {
  orderId: number | string;
  orderNumber: string;
  trackingId: string;
  customerName: string;
  customerEmail?: string | null;
  servicePointName?: string | null;
  weightKg?: number | null;
  performedBy?: string | null;
};

function renderAdminShipmentBookedEmail(data: AdminShipmentBookedEmailData): string {
  const adminBase = getAdminBaseUrl();
  const orderUrl = adminBase ? `${adminBase}/payments/${data.orderId}` : "";
  const trackingUrl = `https://www.postnord.se/vara-verktyg/spara-din-forsandelse?shipmentId=${encodeURIComponent(data.trackingId)}`;
  const orderRef = String(data.orderNumber).replace(/^#+/u, "").trim() || data.orderNumber;

  const rows: Array<{ label: string; value: string }> = [
    { label: "Ordernummer", value: `<strong>#${escapeHtml(orderRef)}</strong>` },
    {
      label: "Spårningsnummer",
      value: `<a href="${escapeHtmlAttr(trackingUrl)}" style="color:#2563eb;text-decoration:none;font-weight:600;">${escapeHtml(data.trackingId)}</a>`,
    },
    { label: "Kund", value: escapeHtml(data.customerName) },
  ];
  if (data.customerEmail) {
    rows.push({
      label: "Kund-e-post",
      value: `<a href="mailto:${escapeHtmlAttr(data.customerEmail)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(data.customerEmail)}</a>`,
    });
  }
  if (data.servicePointName) {
    rows.push({ label: "Ombud", value: escapeHtml(data.servicePointName) });
  }
  if (typeof data.weightKg === "number" && Number.isFinite(data.weightKg)) {
    rows.push({ label: "Vikt", value: `${data.weightKg.toLocaleString("sv-SE")} kg` });
  }
  if (data.performedBy) {
    rows.push({ label: "Bokad av", value: escapeHtml(data.performedBy) });
  }

  return renderAdminEmailLayout({
    eyebrow: "Frakt bokad",
    heading: `Spårningsnummer genererat för order #${orderRef}`,
    sections: [
      adminInfoSection(rows),
      adminBlockSection(
        "Nästa steg",
        "Etiketten finns tillgänglig i admin under ordern. Kunden får automatiskt ett mejl med spårningslänken.",
      ),
    ],
    ...(orderUrl ? { cta: { label: "Öppna ordern i Turbomeck Studio", url: orderUrl } } : {}),
  });
}

export async function sendAdminShipmentBookedEmail(
  data: AdminShipmentBookedEmailData,
): Promise<boolean> {
  const config = await getMailConfig();
  if (!config) return false;
  if (!isAdminEventEnabled(config, "shipmentBooked")) return false;
  const recipients = parseAdminNotificationRecipients(config.adminNotificationEmails);
  if (recipients.length === 0) return false;

  const transporter = await buildAdminTransport(config);
  const html = renderAdminShipmentBookedEmail(data);
  const orderRef = String(data.orderNumber).replace(/^#+/u, "").trim() || data.orderNumber;

  try {
    await transporter.sendMail({
      from: `"Turbomeck Admin" <${config.from}>`,
      to: recipients.join(", "),
      subject: `Frakt bokad #${orderRef} – ${data.customerName}`,
      html,
    });
    console.log(
      `[email] Admin shipment-booked notice sent to ${recipients.join(", ")} for order ${data.orderNumber}`,
    );
    return true;
  } catch (error) {
    console.error("[email] Failed to send admin shipment-booked notice:", error);
    return false;
  }
}
