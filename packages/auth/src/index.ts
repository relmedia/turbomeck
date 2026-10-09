import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Nodemailer from "next-auth/providers/nodemailer";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, users, accounts, sessions, verificationTokens, appSettings } from "@repo/database";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type { DefaultSession } from "next-auth";
import { renderMagicLinkEmail, renderPasswordResetEmail,
  renderContactMessageEmail,
} from "./email-templates";
import { buildSmtpTransport, type MailTransportConfig } from "./smtp-transport";
import { consumeCredentialsAttempt } from "./bruteforce-throttle";

type MailConfig = MailTransportConfig;

/** VPS/bootstrap: set when `app_settings.mail` is not configured yet (e.g. before first admin login). */
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
  const from = process.env.MAIL_FROM?.trim() || user || "noreply@localhost";
  const tlsServername = process.env.SMTP_TLS_SERVERNAME?.trim();
  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    user,
    password,
    from,
    ...(tlsServername ? { tlsServername } : {}),
  };
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

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string; role?: string };
  }
}

/**
 * SECURITY (audit H8 + L9): refuse to boot in production without the
 * essential auth secrets configured. Auth.js will happily start with no
 * AUTH_SECRET and emit signed-cookie-less tokens; once we noticed that, the
 * only safe behavior is to fail fast.
 *
 * - `AUTH_SECRET` / `NEXTAUTH_SECRET` are required to sign JWT session tokens
 *   and CSRF state. Missing → Auth.js falls back to weak defaults.
 * - The cron / internal-API secrets are checked at the call sites and so are
 *   not validated here (different processes may not need them).
 */
function assertProductionAuthEnv(): void {
  if (process.env.NODE_ENV !== "production") return;
  const secret = (
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    ""
  ).trim();
  if (!secret) {
    throw new Error(
      "[@repo/auth] AUTH_SECRET (or NEXTAUTH_SECRET) must be set in production. Refusing to start.",
    );
  }
  if (secret.length < 32) {
    throw new Error(
      "[@repo/auth] AUTH_SECRET is too short (< 32 chars). Generate one with `openssl rand -base64 48` and set it in env.",
    );
  }
}
assertProductionAuthEnv();

export { renderTestEmail } from "./email-templates";
export { validatePassword, BCRYPT_COST } from "./password-policy";

/**
 * Send the storefront password-reset email via the same SMTP pipeline the
 * magic-link provider uses. Returns true if the message was handed to the
 * transporter, false if mail is not configured. Throws on transport errors.
 *
 * The forgot-password route uses this to ensure the user actually receives a
 * working link — previously the route persisted a token in the DB but never
 * delivered the email, locking real users out of their accounts.
 */
export async function sendPasswordResetEmail(args: {
  to: string;
  url: string;
}): Promise<boolean> {
  const config = await getMailConfig();
  if (!config) {
    console.error(
      "[Auth] Mail settings not configured. Cannot send password-reset email."
    );
    return false;
  }
  const transporter = buildSmtpTransport(config);
  const { html, text } = renderPasswordResetEmail(args.url);
  await transporter.sendMail({
    from: config.from || config.user || "noreply@localhost",
    to: args.to,
    subject: "Återställ ditt Turbomeck-lösenord",
    html,
    text,
  });
  return true;
}

/**
 * Canonical public origin for this Node process (set in each app’s next.config + PM2).
 * Bracket access avoids some bundlers inlining the wrong value at build time.
 */
function getMagicLinkBase(): string {
  return (
    process.env["PUBLIC_AUTH_ORIGIN"]?.trim() ||
    process.env["NEXTAUTH_URL"]?.trim() ||
    process.env["AUTH_URL"]?.trim() ||
    ""
  );
}

/** Admin Next runs on :3001 in prod; flag may be missing from bundled env. */
function isStudioAdminProcess(): boolean {
  const verify = process.env["AUTH_VERIFY_PATH"] || "";
  return (
    process.env["STUDIO_AUTH_MAGIC_LINKS"] === "1" ||
    process.env["PORT"] === "3001" ||
    verify.includes("/studio/") ||
    verify === "/verify"
  );
}

/** Canonical staff host. Override per-deploy with ADMIN_STUDIO_HOSTNAME. */
const DEFAULT_STUDIO_HOSTNAME = "studio.turbomeck.se";
/** Shop apex hosts whose magic links must be rewritten to the studio host.
 *  The .cloud pair stays listed while that domain still resolves to the shop. */
const DEFAULT_SHOP_AUTH_HOSTNAMES =
  "turbomeck.se,www.turbomeck.se,turbomeck.cloud,www.turbomeck.cloud";

function studioHostnameFromEnv(): string {
  return process.env["ADMIN_STUDIO_HOSTNAME"]?.trim() || DEFAULT_STUDIO_HOSTNAME;
}

function shopAuthHostnamesFromEnv(): string[] {
  return (process.env["ADMIN_SHOP_AUTH_HOSTNAMES"] || DEFAULT_SHOP_AUTH_HOSTNAMES)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Magic-link send limits. Five links an hour is far above any human use (the
 * link is valid for 15 minutes), and 20/h per IP still allows a family or an
 * office behind one NAT address to sign in.
 */
const MAGIC_LINK_WINDOW_MS = 60 * 60 * 1000;
const MAGIC_LINK_MAX_PER_EMAIL = 5;
const MAGIC_LINK_MAX_PER_IP = 20;

function defaultStudioOrigin(): string {
  return `https://${studioHostnameFromEnv()}`;
}

/** When admin .env uses shop apex for NEXTAUTH_URL, force studio host (matches apps/admin/next.config). */
function coerceMagicLinkBaseForStudioProcess(baseRaw: string): string {
  if (!isStudioAdminProcess()) return baseRaw;
  const studio = studioHostnameFromEnv();
  const apex = new Set(shopAuthHostnamesFromEnv());
  try {
    const normalized = baseRaw.replace(/\/$/, "");
    const u = new URL(normalized.includes("://") ? normalized : `https://${normalized}`);
    if (apex.has(u.hostname)) {
      u.hostname = new URL(`https://${studio}`).hostname;
      return u.origin;
    }
  } catch {
    /* keep */
  }
  return baseRaw.replace(/\/$/, "");
}

/**
 * Staff mail links: never trust Auth.js `url` host (often apex). Rebuild from query + our studio origin.
 */
function buildStaffMagicLinkFromAuthJsUrl(url: string, base: URL): string {
  try {
    const href =
      url.startsWith("http://") || url.startsWith("https://")
        ? url
        : `https://placeholder.invalid${url.startsWith("/") ? "" : "/"}${url}`;
    const parsed = new URL(href);
    const qs = new URLSearchParams(parsed.searchParams);
    qs.set("callbackUrl", `${base.origin}/`);
    const path =
      parsed.pathname && parsed.pathname.includes("callback")
        ? parsed.pathname
        : "/api/auth/callback/email";
    return `${base.origin}${path}?${qs.toString()}`;
  } catch {
    return url;
  }
}

/**
 * Emailed magic links must hit the same Next.js app that sent the email (studio subdomain vs shop).
 * Auth.js may pass the storefront origin or a relative path; rewrite using this app’s PUBLIC_AUTH_ORIGIN.
 */
function magicLinkUrlForThisApp(url: string): string {
  let baseRaw = getMagicLinkBase();
  if (baseRaw) baseRaw = coerceMagicLinkBaseForStudioProcess(baseRaw);
  if (!baseRaw && isStudioAdminProcess()) {
    baseRaw = defaultStudioOrigin();
    if (process.env["NODE_ENV"] === "production") {
      console.error(
        "[@repo/auth] Admin (:3001): NEXTAUTH_URL/PUBLIC_AUTH_ORIGIN missing — using",
        baseRaw,
        "for magic links. Set NEXTAUTH_URL in apps/admin/.env.",
      );
    }
  }
  if (!baseRaw) {
    if (process.env["NODE_ENV"] !== "production") {
      console.warn(
        "[@repo/auth] Set PUBLIC_AUTH_ORIGIN or NEXTAUTH_URL in this app so magic links use the correct host.",
      );
    }
    return url;
  }
  try {
    const normalizedBase = baseRaw.replace(/\/$/, "");
    const base = new URL(normalizedBase);

    if (isStudioAdminProcess()) {
      return buildStaffMagicLinkFromAuthJsUrl(url, base);
    }

    let out: string;
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const parsed = new URL(url);
      if (parsed.origin === base.origin) {
        out = parsed.toString();
      } else {
        out = new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, base.origin).toString();
      }
    } else {
      const pathWithQuery = url.startsWith("/") ? url : `/${url}`;
      out = new URL(pathWithQuery, base.origin).toString();
    }
    return out;
  } catch {
    return url;
  }
}

/** Storefront vs admin: each Next.js app sets AUTH_SIGNIN_PATH (and AUTH_VERIFY_PATH) in its own .env. */
const authSignInPath = process.env.AUTH_SIGNIN_PATH?.trim() || "/logga-in";
const authVerifyPath =
  process.env.AUTH_VERIFY_PATH?.trim() || `${authSignInPath.replace(/\/$/, "")}/verify`;

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: {
    // JWT (not database sessions) because the Credentials provider needs it and
    // both apps share this config.
    strategy: "jwt",
    // SECURITY: Auth.js defaults to 30 days. Staff and customers live in the
    // same `user` table, so a stolen or stale token is worth bounding more
    // tightly; 14 days with a daily rolling refresh keeps "stay signed in"
    // usable for shoppers.
    maxAge: 14 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  providers: [
    Nodemailer({
      id: "email",
      server: { host: "localhost", port: 25 },
      from: "noreply@localhost",
      name: "E-postlänk",
      maxAge: 15 * 60, // 15 minutes
      sendVerificationRequest: async ({ identifier: email, url, request }) => {
        // SECURITY: this is the cheapest abuse path in the product — one POST to
        // /api/auth/signin/email is one SMTP send, and because there is no
        // `signIn` callback the adapter also provisions an account on
        // verification. Unthrottled it lets an attacker mail-bomb a victim and
        // burn our sender reputation, which would land real order
        // confirmations in spam. Per-email first (protects the victim), then
        // per-IP (protects the mail server).
        const emailKey = email.trim().toLowerCase();
        const perEmailOk = consumeCredentialsAttempt(request, {
          bucket: "magic-link-email",
          windowMs: MAGIC_LINK_WINDOW_MS,
          max: MAGIC_LINK_MAX_PER_EMAIL,
          key: emailKey,
        });
        const perIpOk = consumeCredentialsAttempt(request, {
          bucket: "magic-link-ip",
          windowMs: MAGIC_LINK_WINDOW_MS,
          max: MAGIC_LINK_MAX_PER_IP,
        });
        if (!perEmailOk || !perIpOk) {
          // Throwing here surfaces as a generic sign-in error. Deliberately the
          // same message whether or not the address has an account, so this
          // cannot be used to enumerate users.
          console.warn("[@repo/auth] magic-link send throttled");
          throw new Error("För många inloggningsförsök. Försök igen senare.");
        }

        const config = await getMailConfig();
        if (!config) {
          console.error("[Auth] Mail settings not configured. Configure SMTP in admin Settings.");
          throw new Error("E-post är inte konfigurerad. Kontakta administratören.");
        }
        const transporter = buildSmtpTransport(config);
        const link = magicLinkUrlForThisApp(url);
        if (isStudioAdminProcess()) {
          try {
            const studioHost = studioHostnameFromEnv();
            const linkHost = (() => {
              try {
                return new URL(link).hostname;
              } catch {
                return "";
              }
            })();
            const stillShop =
              shopAuthHostnamesFromEnv().includes(linkHost) && linkHost !== studioHost;
            if (stillShop) {
              console.error(
                "[@repo/auth] Magic link still on shop host after rewrite. Check admin env / deploy.",
                { in: url, out: link, port: process.env["PORT"] },
              );
            }
          } catch {
            /* ignore */
          }
        }
        const { html, text } = renderMagicLinkEmail(link);
        await transporter.sendMail({
          from: config.from || config.user || "noreply@localhost",
          to: email,
          subject: "Logga in till Turbomeck",
          html,
          text,
        });
      },
    }),
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            /**
             * Force Google's account chooser on every sign-in.
             *
             * Without `prompt`, Google uses its default: when exactly one
             * account is signed in to the browser it skips the chooser and
             * returns that account silently. Anyone with two Google accounts
             * (a personal and a work one, say) could therefore never pick —
             * they were signed in as whichever account Google happened to
             * have, with no way to switch short of signing out of Google.
             *
             * `select_account` alone, NOT "consent select_account": consent
             * re-prompts for scopes on every login, which is noise for a
             * plain email/profile sign-in.
             */
            authorization: {
              params: { prompt: "select_account" },
            },
            /**
             * Sign in with Google onto an existing account that already has
             * this email address, instead of failing with
             * OAuthAccountNotLinked.
             *
             * Named "dangerous" because it treats the provider's email claim
             * as proof of ownership: a provider that handed us an UNVERIFIED
             * address could be used to reach someone else's account. Google
             * verifies the addresses it asserts, so the claim is sound here —
             * and the alternative is that a customer who registered by email
             * link can never use this button, which is the common case for
             * this shop rather than an edge one.
             *
             * Do not copy this onto a provider that does not verify email.
             */
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    ...(process.env.AUTH_FACEBOOK_ID && process.env.AUTH_FACEBOOK_SECRET
      ? [
          Facebook({
            clientId: process.env.AUTH_FACEBOOK_ID,
            clientSecret: process.env.AUTH_FACEBOOK_SECRET,
            // Same reasoning as Google above: match an existing customer by
            // email rather than dead-ending on OAuthAccountNotLinked. Requires
            // the `email` permission on the Facebook app — without it Facebook
            // returns no address, nothing can be matched, and a duplicate
            // account is created instead.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "E-post", type: "email" },
        password: { label: "Lösenord", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;
        // SECURITY (audit M4): cap credentials sign-in attempts per IP to
        // bound bcrypt.compare CPU cost. bcrypt at cost 12 already makes
        // password guessing infeasible per-attempt; the throttle exists so
        // an attacker can't burn server CPU sustained from one host. We
        // return `null` on rate-limit so NextAuth surfaces the canonical
        // CredentialsSignin error — same shape as a wrong password — and
        // we don't reveal that throttling kicked in.
        const allowed = consumeCredentialsAttempt(request, {
          bucket: "credentials-signin",
          windowMs: 15 * 60_000,
          max: 10,
        });
        if (!allowed) return null;
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, String(credentials.email).toLowerCase().trim()))
          .limit(1);
        if (!user?.password) return null;
        const ok = await bcrypt.compare(String(credentials.password), user.password);
        if (!ok) return null;
        // SECURITY (audit H9): reject login if the email was never verified.
        // Otherwise an attacker can register an account against someone else's
        // address (the public admin signup endpoint) and silently take the
        // email's identity inside our store. Magic-link signups already set
        // emailVerified; the storefront reset-password flow also sets it on
        // successful reset, so existing credentials users can recover via
        // "Forgot password".
        if (!user.emailVerified) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image ?? undefined,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    /**
     * NextAuth middleware gates requests before app `proxy.ts` runs. Without this,
     * unauthenticated users get 307 → `pages.signIn` for matched routes (e.g. `/api/product/*`),
     * so the product proxy returns HTML instead of JSON.
     * We allow all requests through; each app’s middleware enforces access (admin studio, etc.).
     */
    authorized() {
      return true;
    },
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "customer";
      }
      if (trigger === "update" && session?.image != null) {
        token.picture = session.image;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string | undefined;
        if (token.picture) session.user.image = token.picture as string;
      }
      return session;
    },
    /**
     * Keep redirects on this app’s AUTH_URL (each app sets its own port in dev).
     * Prevents cross-app jumps like client → localhost:3001/studio/logga-in.
     */
    redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        const next = new URL(url);
        if (next.origin === new URL(baseUrl).origin) return url;
      } catch {
        /* ignore */
      }
      return baseUrl;
    },
  },
  pages: {
    signIn: authSignInPath,
    verifyRequest: authVerifyPath,
    error: authSignInPath,
  },
});

/** Where contact-form messages go. */
function contactRecipients(config: MailConfig): string[] {
  const explicit = process.env.CONTACT_EMAIL_TO?.trim();
  if (explicit) {
    return explicit
      .split(/[,;\s]+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.includes("@"));
  }
  // `adminNotificationEmails` is stored on the mail settings row but is not
  // part of the transport type, so read it defensively rather than widening
  // MailTransportConfig for one consumer.
  const admins = (
    (config as { adminNotificationEmails?: string }).adminNotificationEmails ?? ""
  )
    .split(/[,;\s]+/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.includes("@"));
  if (admins.length > 0) return admins;
  const fallback = (config.from || config.user || "").trim();
  return fallback.includes("@") ? [fallback] : [];
}

/**
 * Deliver a contact-form message to the shop.
 *
 * Returns false when mail is not configured or no recipient can be resolved,
 * so the route can tell the visitor honestly instead of pretending it sent.
 * Throws on transport errors, which the route turns into a 502.
 */
export async function sendContactMessageEmail(args: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<boolean> {
  const config = await getMailConfig();
  if (!config) {
    console.error("[contact] Mail settings not configured; cannot deliver message.");
    return false;
  }
  const to = contactRecipients(config);
  if (to.length === 0) {
    console.error(
      "[contact] No recipient resolved. Set CONTACT_EMAIL_TO, or admin notification emails in mail settings.",
    );
    return false;
  }

  const transporter = buildSmtpTransport(config);
  const { html, text } = renderContactMessageEmail(args);
  await transporter.sendMail({
    from: config.from || config.user || "noreply@localhost",
    to,
    // The visitor's address must not be the envelope sender (SPF/DKIM), but it
    // should be one click away for whoever answers.
    replyTo: `${args.name} <${args.email}>`,
    subject: `Kontakt: ${args.subject}`,
    html,
    text,
  });
  return true;
}
