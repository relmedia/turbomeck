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
};

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
      return NextResponse.json({
        host: "",
        port: 587,
        secure: false,
        user: "",
        password: "",
        from: "",
      } satisfies MailSettings);
    }
    const parsed = JSON.parse(row[0].value) as MailSettings;
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Failed to fetch mail settings:", err);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await req.json()) as MailSettings;
    const value = JSON.stringify({
      host: body.host ?? "",
      port: Number(body.port) || 587,
      secure: Boolean(body.secure),
      user: body.user ?? "",
      password: body.password ?? "",
      from: body.from ?? "",
    });
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
