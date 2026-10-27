import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { emailDesigns } from "@repo/database/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { sanitizeEmailSubject } from "@repo/sanitize-html";

/**
 * Visually-built email designs.
 *
 * The HTML here comes out of the Unlayer editor, not from a text field an
 * admin typed into, so it is stored as produced rather than run through the
 * copy sanitiser — that allowlist is inline-only and would strip the table
 * layout the editor just built. The subject IS sanitised: it becomes a mail
 * header, where markup is meaningless and CR/LF is header injection.
 *
 * The real safety boundary is elsewhere: a design only reaches a customer
 * once `isActive` is set, which is off by default and a separate action.
 */

type Body = {
  id?: number;
  name?: string;
  locale?: string;
  templateKey?: string | null;
  subject?: string;
  design?: Record<string, unknown> | null;
  html?: string;
  isActive?: boolean;
};

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") return null;
  return session;
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  try {
    if (id) {
      const [row] = await db
        .select()
        .from(emailDesigns)
        .where(eq(emailDesigns.id, Number(id)))
        .limit(1);
      if (!row) return NextResponse.json({ error: "Hittades inte" }, { status: 404 });
      return NextResponse.json(row);
    }
    /**
     * The list omits `design` and `html` — they are tens of kilobytes each and
     * the list only needs names and status. Fetch one by id to edit it.
     */
    const rows = await db
      .select({
        id: emailDesigns.id,
        name: emailDesigns.name,
        locale: emailDesigns.locale,
        templateKey: emailDesigns.templateKey,
        subject: emailDesigns.subject,
        isActive: emailDesigns.isActive,
        updatedAt: emailDesigns.updatedAt,
      })
      .from(emailDesigns)
      .orderBy(desc(emailDesigns.updatedAt));
    return NextResponse.json({ designs: rows });
  } catch (err) {
    console.error("[settings/designs] read failed:", err);
    return NextResponse.json({ error: "Kunde inte hämta designer" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Body;
    const name = String(body.name ?? "").trim() || "Namnlös mall";
    const locale = body.locale === "en" ? "en" : "sv";
    const templateKey = body.templateKey?.trim() ? body.templateKey.trim() : null;
    const subject = sanitizeEmailSubject(String(body.subject ?? ""));
    const isActive = Boolean(body.isActive);

    /**
     * Activating replaces whatever is active for the same (templateKey,
     * locale). The partial unique index would otherwise reject the write —
     * standing the old one down first is what makes activation a swap rather
     * than an error the admin has to resolve by hand.
     */
    if (isActive && templateKey) {
      await db
        .update(emailDesigns)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(emailDesigns.templateKey, templateKey),
            eq(emailDesigns.locale, locale),
            eq(emailDesigns.isActive, true),
            ...(body.id ? [ne(emailDesigns.id, body.id)] : []),
          ),
        );
    }

    const values = {
      name,
      locale,
      templateKey,
      subject,
      design: body.design ?? null,
      html: String(body.html ?? ""),
      isActive,
      updatedAt: new Date(),
    };

    if (body.id) {
      const [row] = await db
        .update(emailDesigns)
        .set(values)
        .where(eq(emailDesigns.id, body.id))
        .returning({ id: emailDesigns.id });
      if (!row) return NextResponse.json({ error: "Hittades inte" }, { status: 404 });
      return NextResponse.json({ success: true, id: row.id });
    }

    const [row] = await db.insert(emailDesigns).values(values).returning({ id: emailDesigns.id });
    return NextResponse.json({ success: true, id: row?.id });
  } catch (err) {
    console.error("[settings/designs] save failed:", err);
    return NextResponse.json({ error: "Kunde inte spara designen" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isFinite(id) || id < 1) {
    return NextResponse.json({ error: "Ogiltigt id" }, { status: 400 });
  }
  try {
    await db.delete(emailDesigns).where(eq(emailDesigns.id, id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[settings/designs] delete failed:", err);
    return NextResponse.json({ error: "Kunde inte radera" }, { status: 500 });
  }
}
