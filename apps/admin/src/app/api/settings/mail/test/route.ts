import { auth } from "@repo/auth";
import { buildSmtpTransport } from "@repo/auth/smtp-transport";
import { NextResponse } from "next/server";

type MailSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  tlsServername?: string;
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
    const tlsServername = (body.tlsServername ?? "").trim();

    if (!host) {
      return NextResponse.json(
        { success: false, error: "SMTP-värd krävs" },
        { status: 400 }
      );
    }

    const transporter = buildSmtpTransport({
      host,
      port,
      secure,
      user,
      password,
      from: body.from ?? "",
      ...(tlsServername ? { tlsServername } : {}),
      ...(process.env.NODE_ENV !== "production" ? { rejectUnauthorized: false } : {}),
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
