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

async function getMailConfig(): Promise<MailConfig | null> {
  try {
    const [row] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "mail"))
      .limit(1);
    if (!row?.value) return null;
    const parsed = JSON.parse(row.value) as MailConfig;
    if (!parsed.host?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string; role?: string };
  }
}

export { renderTestEmail } from "./email-templates";
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
        const transporter = nodemailer.createTransport({
          host: config.host,
          port: config.port || 587,
          secure: config.secure,
          auth: config.user ? { user: config.user, pass: config.password } : undefined,
          tls: { rejectUnauthorized: process.env.NODE_ENV === "production" },
        });
        const { html, text } = renderMagicLinkEmail(url);
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
  },
  pages: {
    signIn: "/logga-in",
    verifyRequest: "/logga-in/verify",
    error: "/logga-in",
  },
});
