import nodemailer from "nodemailer";
import { db, appSettings } from "@repo/database";
import { eq } from "drizzle-orm";

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
  items: Array<{
    productName: string;
    productImage?: string | null;
    variant?: string | null;
    price: number;
    quantity: number;
  }>;
};

function renderOrderConfirmationEmail(data: OrderEmailData): string {
  const trackingUrl = data.trackingId
    ? `https://www.postnord.se/vara-verktyg/spara-din-forsandelse?shipmentId=${encodeURIComponent(data.trackingId)}`
    : null;

  const itemsHtml = data.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 16px 0; border-bottom: 1px solid #e5e7eb;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td width="80" style="vertical-align: top;">
                ${
                  item.productImage
                    ? `<img src="${item.productImage}" alt="${item.productName}" width="64" height="64" style="border-radius: 8px; object-fit: cover; background: #f3f4f6;" />`
                    : `<div style="width: 64px; height: 64px; background: #f3f4f6; border-radius: 8px;"></div>`
                }
              </td>
              <td style="vertical-align: top; padding-left: 12px;">
                <p style="margin: 0 0 4px 0; font-weight: 600; color: #111827;">${item.productName}</p>
                ${item.variant ? `<p style="margin: 0 0 4px 0; font-size: 13px; color: #6b7280;">${item.variant}</p>` : ""}
                <p style="margin: 0; font-size: 13px; color: #6b7280;">Antal: ${item.quantity}</p>
              </td>
              <td style="vertical-align: top; text-align: right; white-space: nowrap;">
                <p style="margin: 0; font-weight: 600; color: #111827;">${(item.price * item.quantity).toLocaleString("sv-SE")} kr</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Orderbekräftelse - Turbomeck</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #111827 0%, #1f2937 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 2px;">
                <span style="color: #6ec900;">TURBO</span><span style="color: #ffffff;">MECK</span>
              </h1>
            </td>
          </tr>
          
          <!-- Success Banner -->
          <tr>
            <td style="padding: 40px 40px 24px 40px; text-align: center;">
              <div style="display: inline-block; width: 64px; height: 64px; background-color: #dcfce7; border-radius: 50%; line-height: 64px; margin-bottom: 16px;">
                <span style="font-size: 28px;">✓</span>
              </div>
              <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #111827;">Tack för din beställning!</h2>
              <p style="margin: 0; color: #6b7280; font-size: 15px;">Vi har mottagit din order och börjar behandla den direkt.</p>
            </td>
          </tr>
          
          <!-- Order Info -->
          <tr>
            <td style="padding: 0 40px 24px 40px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px; padding: 20px;">
                <tr>
                  <td>
                    <table cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 8px 16px;">
                          <p style="margin: 0; font-size: 13px; color: #6b7280;">Ordernummer</p>
                          <p style="margin: 4px 0 0 0; font-weight: 600; color: #111827;">${data.orderNumber}</p>
                        </td>
                        <td style="padding: 8px 16px; text-align: right;">
                          <p style="margin: 0; font-size: 13px; color: #6b7280;">Datum</p>
                          <p style="margin: 4px 0 0 0; font-weight: 600; color: #111827;">${new Date().toLocaleDateString("sv-SE")}</p>
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
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #eff6ff; border-radius: 8px; padding: 20px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 8px 0; font-weight: 600; color: #1e40af;">📦 Spåra din leverans</p>
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: #3b82f6;">Spårningsnummer: ${data.trackingId}</p>
                    <a href="${trackingUrl}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">Spåra hos PostNord →</a>
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
              <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #111827;">Beställda produkter</h3>
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
                  <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Delsumma</td>
                  <td style="padding: 6px 0; text-align: right; color: #111827; font-size: 14px;">${data.subtotal.toLocaleString("sv-SE")} kr</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Frakt</td>
                  <td style="padding: 6px 0; text-align: right; color: #111827; font-size: 14px;">${data.shippingCost > 0 ? `${data.shippingCost.toLocaleString("sv-SE")} kr` : "Gratis"}</td>
                </tr>
                ${
                  data.discount > 0
                    ? `
                <tr>
                  <td style="padding: 6px 0; color: #16a34a; font-size: 14px;">Rabatt</td>
                  <td style="padding: 6px 0; text-align: right; color: #16a34a; font-size: 14px;">-${data.discount.toLocaleString("sv-SE")} kr</td>
                </tr>
                `
                    : ""
                }
                <tr>
                  <td style="padding: 12px 0 0 0; font-weight: 700; font-size: 18px; color: #111827;">Totalt</td>
                  <td style="padding: 12px 0 0 0; text-align: right; font-weight: 700; font-size: 18px; color: #111827;">${data.total.toLocaleString("sv-SE")} kr</td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Shipping Address -->
          <tr>
            <td style="padding: 0 40px 32px 40px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px; padding: 20px;">
                <tr>
                  <td>
                    <h4 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #111827;">Leveransadress</h4>
                    <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">
                      ${data.firstName} ${data.lastName}<br>
                      ${data.address}<br>
                      ${data.postalCode} ${data.city}<br>
                      ${data.country === "SE" ? "Sverige" : data.country}
                      ${data.servicePointName ? `<br><br><strong>Utlämningsställe:</strong> ${data.servicePointName}` : ""}
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
                Har du frågor? Kontakta oss på <a href="mailto:info@turbomeck.se" style="color: #6ec900; text-decoration: none;">info@turbomeck.se</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} Turbomeck. Alla rättigheter förbehållna.
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

  const html = renderOrderConfirmationEmail(data);

  try {
    await transporter.sendMail({
      from: `"Turbomeck" <${config.from}>`,
      to: data.email,
      subject: `Orderbekräftelse ${data.orderNumber} - Turbomeck`,
      html,
    });
    console.log(`[email] Order confirmation sent to ${data.email} for ${data.orderNumber}`);
    return true;
  } catch (error) {
    console.error("[email] Failed to send order confirmation:", error);
    return false;
  }
}
