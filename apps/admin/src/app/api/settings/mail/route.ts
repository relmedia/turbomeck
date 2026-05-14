import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { appSettings } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const MAIL_KEY = "mail";

export type MailSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  /**
   * Optional: set the TLS SNI / cert verification name when the SMTP host is a
   * vanity DNS name (e.g. smtp.example.com) but the cert is for the underlying
   * shared server (e.g. prime4.inleed.net).
   */
  tlsServername?: string;
  /**
   * Comma/newline-separated list of admin recipients that should get a
   * "new order placed" notification each time a customer completes checkout.
   * Stored raw so the form can round-trip exactly what the admin typed.
   */
  adminNotificationEmails?: string;
  /**
   * Master switch for the new-order admin notification. When false, the
   * recipients list is preserved but no mail is sent. Defaults to true so
   * existing deployments keep their current behavior after upgrade.
   */
  adminNotificationsEnabled?: boolean;
  /**
   * Per-event toggles. A specific event only mails when both the master
   * switch above and the matching key here are true. Absent keys default
   * to true so older docs keep their current behavior after upgrade.
   */
  adminNotifications?: AdminNotificationFlags;
};

export type AdminNotificationFlags = {
  newOrder?: boolean;
  newReview?: boolean;
  userDeleted?: boolean;
  shipmentBooked?: boolean;
};

const DEFAULT_FLAGS: Required<AdminNotificationFlags> = {
  newOrder: true,
  newReview: true,
  userDeleted: true,
  shipmentBooked: true,
};

const DEFAULTS: MailSettings = {
  host: "",
  port: 587,
  secure: false,
  user: "",
  password: "",
  from: "",
  tlsServername: "",
  adminNotificationEmails: "",
  adminNotificationsEnabled: true,
  adminNotifications: DEFAULT_FLAGS,
};

function normalizeAdminEmails(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .split(/[\s,;]+/u)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"))
    .join(", ");
}

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const row = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, MAIL_KEY))
      .limit(1);
    if (!row[0]) {
      return NextResponse.json(DEFAULTS);
    }
    const parsed = JSON.parse(row[0].value) as Partial<MailSettings>;
    return NextResponse.json({ ...DEFAULTS, ...parsed } satisfies MailSettings);
  } catch (err) {
    console.error("Failed to fetch mail settings:", err);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

/**
 * Read-modify-write so two independent cards on the settings page
 * (SMTP form + admin-notifications form) can save independently
 * without wiping fields owned by the other card.
 * `has()` checks are used so a field that is intentionally absent
 * from the payload is left untouched.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await req.json()) as Partial<MailSettings> & Record<string, unknown>;

    const existingRow = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, MAIL_KEY))
      .limit(1);
    const existing: MailSettings = existingRow[0]
      ? { ...DEFAULTS, ...(JSON.parse(existingRow[0].value) as Partial<MailSettings>) }
      : DEFAULTS;

    const has = (key: keyof MailSettings) => Object.prototype.hasOwnProperty.call(body, key);

    const mergedFlags: Required<AdminNotificationFlags> = (() => {
      const current = { ...DEFAULT_FLAGS, ...(existing.adminNotifications ?? {}) };
      const incoming = body.adminNotifications;
      if (!incoming || typeof incoming !== "object") return current;
      const next: Required<AdminNotificationFlags> = { ...current };
      for (const k of Object.keys(DEFAULT_FLAGS) as Array<keyof AdminNotificationFlags>) {
        if (Object.prototype.hasOwnProperty.call(incoming, k)) {
          next[k] = Boolean((incoming as AdminNotificationFlags)[k]);
        }
      }
      return next;
    })();

    const merged: MailSettings = {
      host: has("host") ? String(body.host ?? "") : existing.host,
      port: has("port") ? Number(body.port) || 587 : existing.port,
      secure: has("secure") ? Boolean(body.secure) : existing.secure,
      user: has("user") ? String(body.user ?? "") : existing.user,
      password: has("password") ? String(body.password ?? "") : existing.password,
      from: has("from") ? String(body.from ?? "") : existing.from,
      tlsServername: has("tlsServername")
        ? String(body.tlsServername ?? "").trim()
        : (existing.tlsServername ?? ""),
      adminNotificationEmails: has("adminNotificationEmails")
        ? normalizeAdminEmails(body.adminNotificationEmails)
        : (existing.adminNotificationEmails ?? ""),
      adminNotificationsEnabled: has("adminNotificationsEnabled")
        ? Boolean(body.adminNotificationsEnabled)
        : (existing.adminNotificationsEnabled ?? true),
      adminNotifications: mergedFlags,
    };

    const value = JSON.stringify(merged);
    await db
      .insert(appSettings)
      .values({
        key: MAIL_KEY,
        value,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt: new Date() },
      });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to save mail settings:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
