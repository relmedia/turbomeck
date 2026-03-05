import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { PRODUCT_API } from "@/lib/product-api";

const MARGIN = 50;
const LINE_HEIGHT = 14;
const HEADER_SIZE = 14;
const BODY_SIZE = 10;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CHARS_PER_LINE = 70;

function wrapText(text: string): string[] {
  const lines: string[] = [];
  const parts = text.split(/\n/);
  for (const part of parts) {
    const words = part.split(/\s+/);
    let line = "";
    for (const word of words) {
      if (line.length + word.length + 1 <= CHARS_PER_LINE) {
        line += (line ? " " : "") + word;
      } else {
        if (line) lines.push(line);
        if (word.length > CHARS_PER_LINE) {
          for (let i = 0; i < word.length; i += CHARS_PER_LINE) {
            lines.push(word.slice(i, i + CHARS_PER_LINE));
          }
          line = "";
        } else {
          line = word;
        }
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let orders: unknown[] = [];
  try {
    const ordersRes = await fetch(
      `${PRODUCT_API}/orders?userId=${encodeURIComponent(session.user.id)}`,
      { cache: "no-store" }
    );
    if (ordersRes.ok) orders = await ordersRes.json();
  } catch {
    // Non-blocking
  }

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage();
  let y = PAGE_HEIGHT - MARGIN;

  const drawText = (
    text: string,
    options: { size?: number; bold?: boolean } = {}
  ) => {
    const size = options.size ?? BODY_SIZE;
    const f = options.bold ? fontBold : font;
    const lines = wrapText(text);
    for (const line of lines) {
      if (y < MARGIN + LINE_HEIGHT) {
        page = pdfDoc.addPage();
        y = PAGE_HEIGHT - MARGIN;
      }
      page.drawText(line, {
        x: MARGIN,
        y,
        size,
        font: f,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= LINE_HEIGHT;
    }
  };

  const drawSection = (title: string, content: string) => {
    if (y < MARGIN + LINE_HEIGHT * 4) {
      page = pdfDoc.addPage();
      y = PAGE_HEIGHT - MARGIN;
    }
    y -= LINE_HEIGHT;
    drawText(title, { size: HEADER_SIZE, bold: true });
    y -= 4;
    drawText(content);
    y -= LINE_HEIGHT;
  };

  drawSection(
    "Mina uppgifter – Turbomeck",
    `Exporterat: ${new Date().toLocaleString("sv-SE")}`
  );

  const profile = user;
  drawSection(
    "Profil",
    [
      `Namn: ${profile.name ?? "—"}`,
      `E-post: ${profile.email ?? "—"}`,
      `Registrerad: ${profile.createdAt ? new Date(profile.createdAt).toLocaleDateString("sv-SE") : "—"}`,
    ].join("\n")
  );

  const savedAddress = profile.metadata?.savedAddress as Record<string, unknown> | null | undefined;
  if (savedAddress && typeof savedAddress === "object") {
    const addr = savedAddress as Record<string, unknown>;
    const parts = [
      addr.firstName || addr.lastName ? `${addr.firstName ?? ""} ${addr.lastName ?? ""}`.trim() : null,
      addr.address,
      addr.address2,
      addr.postalCode && addr.city ? `${addr.postalCode} ${addr.city}` : (addr.city ?? addr.postalCode),
      addr.country,
    ].filter(Boolean);
    drawSection("Sparad adress", parts.join("\n"));
  } else {
    drawSection("Sparad adress", "Ingen adress sparad.");
  }

  const wishlist = (profile.metadata?.savedWishlist ?? []) as unknown[];
  drawSection(
    "Önskelista",
    wishlist.length > 0
      ? `Produkt-ID: ${wishlist.join(", ")}`
      : "Önskelistan är tom."
  );

  if (Array.isArray(orders) && orders.length > 0) {
    let orderText = "";
    for (const o of orders as Record<string, unknown>[]) {
      const orderNumber = o.orderNumber ?? o.id ?? "—";
      const total = typeof o.total === "number" ? o.total : "—";
      const status = o.status ?? "—";
      const date = o.createdAt
        ? new Date(o.createdAt as string).toLocaleDateString("sv-SE")
        : "—";
      orderText += `Order ${orderNumber}: ${total} kr, ${status}, ${date}\n`;
    }
    drawSection("Orderhistorik", orderText.trim());
  } else {
    drawSection("Orderhistorik", "Inga ordrar.");
  }

  const pdfBytes = await pdfDoc.save();
  const filename = `turbomeck-mina-uppgifter-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
