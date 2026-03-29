import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Nodemailer from "next-auth/providers/nodemailer";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, users, accounts, sessions, verificationTokens, appSettings } from "@repo/database";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import type { DefaultSession } from "next-auth";
import { renderMagicLinkEmail } from "./email-templates";

type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

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

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string; role?: string };
  }
}

export { renderTestEmail } from "./email-templates";

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
  return (
    process.env["STUDIO_AUTH_MAGIC_LINKS"] === "1" ||
    process.env["PORT"] === "3001" ||
    (process.env["AUTH_VERIFY_PATH"] || "").includes("/studio/")
  );
}

function defaultStudioOrigin(): string {
  const host = process.env["ADMIN_STUDIO_HOSTNAME"]?.trim() || "studio.turbomeck.cloud";
  return `https://${host}`;
}

/** When admin .env uses shop apex for NEXTAUTH_URL, force studio host (matches apps/admin/next.config). */
function coerceMagicLinkBaseForStudioProcess(baseRaw: string): string {
  if (!isStudioAdminProcess()) return baseRaw;
  const studio =
    process.env["ADMIN_STUDIO_HOSTNAME"]?.trim() || "studio.turbomeck.cloud";
  const apex = new Set(
    (process.env["ADMIN_SHOP_AUTH_HOSTNAMES"] || "turbomeck.cloud,www.turbomeck.cloud")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
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
  session: { strategy: "jwt" }, // Use JWT for credentials - simpler for shared auth
  providers: [
    Nodemailer({
      id: "email",
      server: { host: "localhost", port: 25 },
      from: "noreply@localhost",
      name: "E-postlänk",
      maxAge: 15 * 60, // 15 minutes
      sendVerificationRequest: async ({ identifier: email, url }) => {
        const config = await getMailConfig();
        if (!config) {
          console.error("[Auth] Mail settings not configured. Configure SMTP in admin Settings.");
          throw new Error("E-post är inte konfigurerad. Kontakta administratören.");
        }
        const skipTlsVerify = process.env.SMTP_REJECT_UNAUTHORIZED === "false";
        const transporter = nodemailer.createTransport({
          host: config.host,
          port: config.port || 587,
          secure: config.secure,
          auth: config.user ? { user: config.user, pass: config.password } : undefined,
          tls: skipTlsVerify
            ? { rejectUnauthorized: false, checkServerIdentity: () => undefined }
            : {},
        });
        const link = magicLinkUrlForThisApp(url);
        if (isStudioAdminProcess()) {
          try {
            const stillShop =
              /\/\/(www\.)?turbomeck\.cloud(\/|\?|$)/i.test(link) &&
              !link.includes("studio.turbomeck.cloud");
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
          }),
        ]
      : []),
    ...(process.env.AUTH_FACEBOOK_ID && process.env.AUTH_FACEBOOK_SECRET
      ? [
          Facebook({
            clientId: process.env.AUTH_FACEBOOK_ID,
            clientSecret: process.env.AUTH_FACEBOOK_SECRET,
          }),
        ]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "E-post", type: "email" },
        password: { label: "Lösenord", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, String(credentials.email).toLowerCase().trim()))
          .limit(1);
        if (!user?.password) return null;
        const ok = await bcrypt.compare(String(credentials.password), user.password);
        if (!ok) return null;
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
