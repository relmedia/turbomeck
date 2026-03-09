import { auth, renderTestEmail } from "@repo/auth";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

type Body = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  to: string;
};

/** POST /api/settings/mail/send-test - Send a test email with provided credentials */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Body;
    const host = (body.host ?? "").trim();
    const port = Number(body.port) || 587;
    const secure = Boolean(body.secure);
    const user = body.user ?? "";
    const password = body.password ?? "";
    const from = (body.from ?? "").trim();
    const to = (body.to ?? "").trim().toLowerCase();

    if (!host) {
      return NextResponse.json(
        { success: false, error: "SMTP-värd krävs" },
        { status: 400 }
      );
    }
    if (!to || !to.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Giltig mottagaradress krävs" },
        { status: 400 }
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass: password } : undefined,
      tls: { rejectUnauthorized: process.env.NODE_ENV === "production" },
    });

    const { html, text } = renderTestEmail();
    await transporter.sendMail({
      from: from || user || "noreply@localhost",
      to,
      subject: "E-postkonfiguration verifierad – Turbomeck",
      text,
      html,
    });

    return NextResponse.json({
      success: true,
      message: `Testmail skickad till ${to}`,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Kunde inte skicka testmail";
    return NextResponse.json(
      { success: false, error: message },
      { status: 200 }
    );
  }
}
