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

type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

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
  return getMailConfigFromEnv();
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

  const itemsHtml = data.items
    .map(
      (item) => {
        const lineGross = item.price * item.quantity;
        const lineVat = vatFromGrossIncl25(lineGross);
        const imgSrc = resolveProductImageUrlForEmail(item.productImage);
        const imgAttr = imgSrc ? escapeHtmlAttr(imgSrc) : "";
        return `
      <tr>
        <td style="padding: 16px 0; border-bottom: 1px solid #e5e7eb;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td width="80" style="vertical-align: top;">
                ${
                  imgSrc
                    ? `<img src="${imgAttr}" alt="${escapeHtml(item.productName)}" width="64" height="64" style="display: block; width: 64px; height: 64px; border-radius: 8px; object-fit: cover; background: #f3f4f6;" />`
                    : `<div style="width: 64px; height: 64px; background: #f3f4f6; border-radius: 8px;"></div>`
                }
              </td>
              <td style="vertical-align: top; padding-left: 12px;">
                <p style="margin: 0 0 4px 0; font-weight: 600; color: #111827;">${item.productName}</p>
                ${item.variant ? `<p style="margin: 0 0 4px 0; font-size: 13px; color: #6b7280;">${item.variant}</p>` : ""}
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
                          <p style="margin: 4px 0 0 0; font-weight: 600; color: #111827; font-size: 16px;">${data.orderNumber}</p>
                        </td>
                        <td style="padding: 0; text-align: right;">
                          <p style="margin: 0; font-size: 13px; color: #6b7280;">${t.date}</p>
                          <p style="margin: 4px 0 0 0; font-weight: 600; color: #111827;">${new Date().toLocaleDateString(dateLocale)}</p>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding: 16px 0 0 0; border-top: 1px solid #e5e7eb;">
                          <p style="margin: 0; font-size: 13px; color: #6b7280;">${t.paymentMethod}</p>
                          <p style="margin: 4px 0 0 0; font-weight: 600; color: #111827; font-size: 15px;">${escapeHtml(data.paymentMethodDisplay)}</p>
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
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: #3b82f6;">${t.trackingNumber}: ${data.trackingId}</p>
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
                      ${data.firstName} ${data.lastName}<br>
                      ${data.address}<br>
                      ${data.postalCode} ${data.city}<br>
                      ${getCountryName(data.country, locale)}
                      ${data.servicePointName ? `<br><br><strong>${t.servicePoint}:</strong> ${data.servicePointName}` : ""}
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
