import nodemailer from "nodemailer";
import { db, appSettings } from "@repo/database";
import { eq } from "drizzle-orm";

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

/** Magic-link email header brand block (logo + wordmark, or “T” fallback) — from `packages/auth/src/email-templates.ts`. */
function magicLinkStyleHeaderBrandInner(logoUrl: string): string {
  return logoUrl
    ? `
                    <table role="presentation" align="left" cellspacing="0" cellpadding="0">
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
                    <table role="presentation" align="left" cellspacing="0" cellpadding="0">
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
        return `
      <tr>
        <td style="padding: 16px 0; border-bottom: 1px solid #e5e7eb;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td width="80" style="vertical-align: top;">
                ${
                  item.productImage
                    ? `<img src="${item.productImage}" alt="${item.productName}" width="64" height="64" style="display: block; border-radius: 8px; object-fit: cover; background: #f3f4f6;" />`
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

  const headerBrandInner = magicLinkStyleHeaderBrandInner(logoUrl);

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
          
          <!-- Success Banner -->
          <tr>
            <td style="padding: 40px 40px 24px 40px; text-align: center;">
              <table cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td style="width: 64px; height: 64px; background-color: #dcfce7; border-radius: 32px; text-align: center; vertical-align: middle;">
                    <span style="font-size: 32px; color: #16a34a; line-height: 64px;">✓</span>
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
                ${t.questions} <a href="mailto:info@turbomeck.se" style="color: #6ec900; text-decoration: none;">info@turbomeck.se</a>
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
