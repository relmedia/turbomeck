import { auth } from "@repo/auth";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

type MailSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

/** POST /api/settings/mail/test - Test SMTP connection with provided credentials */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as MailSettings;
    const host = (body.host ?? "").trim();
    const port = Number(body.port) || 587;
    const secure = Boolean(body.secure);
    const user = body.user ?? "";
    const password = body.password ?? "";

    if (!host) {
      return NextResponse.json(
        { success: false, error: "SMTP-värd krävs" },
        { status: 400 }
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass: password } : undefined,
      // Allow self-signed certs in dev
      tls: { rejectUnauthorized: process.env.NODE_ENV === "production" },
    });

    await transporter.verify();

    return NextResponse.json({
      success: true,
      message: "Anslutningen lyckades. SMTP-servern svarar korrekt.",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Kunde inte ansluta till SMTP-servern";
    return NextResponse.json(
      { success: false, error: message },
      { status: 200 }
    );
  }
}
