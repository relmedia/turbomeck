import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { appSettings } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  sanitizeEmailCopy,
  sanitizeEmailSubject,
  safeHexColor,
} from "@repo/sanitize-html";

/**
 * Admin-edited email copy.
 *
 * Stored in `app_settings` under its own key, holding ONLY the fields that
 * differ from the built-in text. An absent key or field means "use the code
 * default", which is what lets every email keep working if this row is empty
 * and lets any template be reset by clearing it.
 *
 * Everything is sanitised HERE, on the way in — never at render time.
 * Rendering sanitisation would mangle the entities the built-in copy depends
 * on (`1&nbsp;000 kr`, `&#128230;`), and copy in this codebase is interpolated
 * into the HTML unescaped by design.
 */
const TEMPLATES_KEY = "email_templates";

type LocaleCode = "sv" | "en";
type FieldMap = Record<string, string>;
type Stored = {
  overrides: Record<string, Partial<Record<LocaleCode, FieldMap>>>;
};

const EMPTY: Stored = { overrides: {} };

/**
 * Which sanitiser each field name gets.
 *
 * Subjects become mail headers and are never escaped downstream, so they take
 * no markup at all. Colours are interpolated straight into a `style`
 * attribute, so they are validated against a hex pattern rather than cleaned —
 * sanitising `red; } body {` would leave a plausible-looking string behind.
 */
function sanitizeField(key: string, value: string): string {
  if (key === "subject") return sanitizeEmailSubject(value);
  if (key === "badgeBg" || key === "accent") return safeHexColor(value, "");
  if (key === "badge") {
    // One emoji. Array.from counts code points, so a surrogate pair is 1.
    return Array.from(value.trim()).slice(0, 2).join("");
  }
  return sanitizeEmailCopy(value);
}

function sanitizeStored(input: unknown): Stored {
  const out: Stored = { overrides: {} };
  const raw = input as Partial<Stored> | null | undefined;
  if (!raw || typeof raw !== "object" || !raw.overrides) return out;

  for (const [templateKey, locales] of Object.entries(raw.overrides)) {
    if (!locales || typeof locales !== "object") continue;
    for (const locale of ["sv", "en"] as const) {
      const fields = locales[locale];
      if (!fields || typeof fields !== "object") continue;
      for (const [field, value] of Object.entries(fields)) {
        if (typeof value !== "string") continue;
        const clean = sanitizeField(field, value);
        /**
         * Empty means "not overridden". Dropping the key rather than storing
         * "" is what makes clearing a box in the editor restore the built-in
         * text instead of sending an email with a gap in it.
         */
        if (clean.trim() === "") continue;
        out.overrides[templateKey] ??= {};
        out.overrides[templateKey]![locale] ??= {};
        out.overrides[templateKey]![locale]![field] = clean;
      }
    }
  }
  return out;
}

async function readStored(): Promise<Stored> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, TEMPLATES_KEY))
    .limit(1);
  if (!row?.value) return EMPTY;
  try {
    return sanitizeStored(JSON.parse(row.value));
  } catch {
    return EMPTY;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await readStored());
  } catch (err) {
    console.error("[settings/templates] read failed:", err);
    return NextResponse.json({ error: "Kunde inte hämta mallar" }, { status: 500 });
  }
}

/**
 * Save one template's overrides.
 *
 * Read-modify-write per template, mirroring the mail settings route: the body
 * carries only the template being edited, so two editors open on different
 * templates cannot overwrite each other.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      templateKey?: string;
      sv?: FieldMap;
      en?: FieldMap;
      reset?: boolean;
    };

    const templateKey = String(body.templateKey ?? "").trim();
    if (!templateKey || !/^[a-z0-9_]+$/i.test(templateKey)) {
      return NextResponse.json({ error: "Ogiltig mall" }, { status: 400 });
    }

    const existing = await readStored();
    const next: Stored = { overrides: { ...existing.overrides } };

    if (body.reset) {
      delete next.overrides[templateKey];
    } else {
      const incoming = sanitizeStored({
        overrides: { [templateKey]: { sv: body.sv ?? {}, en: body.en ?? {} } },
      });
      const cleaned = incoming.overrides[templateKey];
      if (cleaned && Object.keys(cleaned).length > 0) {
        next.overrides[templateKey] = cleaned;
      } else {
        // Everything was blanked — same as a reset.
        delete next.overrides[templateKey];
      }
    }

    const value = JSON.stringify(next);
    await db
      .insert(appSettings)
      .values({ key: TEMPLATES_KEY, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt: new Date() },
      });

    return NextResponse.json({ success: true, overrides: next.overrides[templateKey] ?? null });
  } catch (err) {
    console.error("[settings/templates] save failed:", err);
    return NextResponse.json({ error: "Kunde inte spara mallen" }, { status: 500 });
  }
}
