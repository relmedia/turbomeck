/**
 * Professional HTML email templates for Turbomeck.
 * Uses table-based layout and inline CSS for broad email client support.
 */

const BRAND_COLOR = "#6ec900";
const TEXT_COLOR = "#1f2937";
const MUTED_COLOR = "#6b7280";
const BORDER_COLOR = "#e5e7eb";
const BG_LIGHT = "#f9fafb";

// Logo URL – R2 PNG first; storefront uses logo.png (many mail clients ignore remote SVG)
const LOGO_URL =
  typeof process !== "undefined" && process.env
    ? (() => {
        const env = process.env;
        if (env.EMAIL_LOGO_URL) return env.EMAIL_LOGO_URL;
        const r2Base = (env.R2_PUBLIC_URL || env.NEXT_PUBLIC_R2_PUBLIC_URL || "").replace(/\/$/, "");
        if (r2Base) return `${r2Base}/branding/logo.png`;
        const appBase = (env.NEXT_PUBLIC_APP_URL || env.NEXTAUTH_URL || "").replace(/\/$/, "");
        if (appBase) return `${appBase}/logo.png`;
        return "";
      })()
    : "";

function baseWrapper(innerHtml: string) {
  const headerContent = LOGO_URL
    ? `
                    <table role="presentation" align="left" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 14px;">
                          <img src="${LOGO_URL}" alt="Turbomeck" width="35" height="35" style="display: block; width: 35px; height: 35px;" />
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

  return `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Turbomeck</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: ${BG_LIGHT}; color: ${TEXT_COLOR}; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${BG_LIGHT}; min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto;">
          <tr>
            <td style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background: linear-gradient(135deg, ${BRAND_COLOR} 0%, #5ab800 100%); padding: 28px 32px; text-align: left;">
                    ${headerContent}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 32px;">
                    ${innerHtml}
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 20px 32px; border-top: 1px solid ${BORDER_COLOR}; background-color: ${BG_LIGHT};">
                    <p style="margin: 0; font-size: 12px; color: ${MUTED_COLOR}; text-align: center;">
                      Detta meddelande skickades från Turbomeck. Om du inte förväntade dig detta mail kan du ignorera det.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Magic link / sign-in email template.
 */
export function renderMagicLinkEmail(url: string): { html: string; text: string } {
  const html = baseWrapper(`
    <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: ${TEXT_COLOR};">
      Logga in till Turbomeck
    </h2>
    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: ${TEXT_COLOR};">
      Hej,
    </p>
    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: ${TEXT_COLOR};">
      Du har begärt att logga in på ditt konto. Klicka på knappen nedan för att slutföra inloggningen.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center" style="padding: 8px 0 24px 0;">
          <a href="${url}" style="display: inline-block; background-color: ${BRAND_COLOR}; color: #ffffff !important; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px; box-shadow: 0 2px 4px rgba(110, 201, 0, 0.3);">
            Logga in
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 13px; color: ${MUTED_COLOR}; line-height: 1.5;">
      Länken är giltig i 15 minuter av säkerhetsskäl. Om du inte begärde denna inloggning kan du ignorera detta mail.
    </p>
    <p style="margin: 16px 0 0 0; font-size: 12px; color: ${MUTED_COLOR}; word-break: break-all;">
      Fungerar knappen inte? Kopiera och klistra in denna länk i din webbläsare:<br>
      <a href="${url}" style="color: ${BRAND_COLOR}; text-decoration: underline;">${url}</a>
    </p>
  `);

  const text = `Logga in till Turbomeck

Hej,

Du har begärt att logga in på ditt konto. Öppna länken nedan för att slutföra inloggningen:

${url}

Länken är giltig i 15 minuter av säkerhetsskäl.`;

  return { html, text };
}

/**
 * Test email template for SMTP verification.
 */
export function renderTestEmail(): { html: string; text: string } {
  const html = baseWrapper(`
    <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: ${TEXT_COLOR};">
      E-postkonfiguration verifierad
    </h2>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: ${TEXT_COLOR};">
      Detta är en testmail från Turbomeck Studio. Om du läser detta meddelande har e-postinställningarna konfigurerats korrekt och du kan nu ta emot transaktionsmail till dina kunder.
    </p>
    <div style="margin-top: 24px; padding: 16px; background-color: ${BG_LIGHT}; border-radius: 6px; border-left: 4px solid ${BRAND_COLOR};">
      <p style="margin: 0; font-size: 14px; color: ${MUTED_COLOR};">
        Skickat från Turbomeck Admin · E-postinställningar
      </p>
    </div>
  `);

  const text = `E-postkonfiguration verifierad

Detta är en testmail från Turbomeck Studio. Om du läser detta meddelande har e-postinställningarna konfigurerats korrekt.`;

  return { html, text };
}
