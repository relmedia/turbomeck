/**
 * Admin-editable overrides for email copy.
 *
 * Every transactional email is a tagged template literal compiled into the
 * app, so changing one sentence meant a code edit, a build and a deploy. This
 * lets the wording be edited from admin instead.
 *
 * ## The contract that makes this safe
 *
 * **The code is the default, the database only holds differences.** An empty
 * or missing `email_templates` row must leave every email rendering exactly as
 * it does today — that is asserted byte-for-byte in
 * `__verify-template-overrides.ts`, because it is the whole safety claim. A
 * blank field is treated as "not overridden", not as "render nothing": the
 * most likely editor mistake is clearing a box, and that must not ship an
 * email with an empty heading.
 *
 * ## Why the values are trusted HTML
 *
 * Copy in this codebase is interpolated UNESCAPED and relies on it — `coreBody`
 * carries `1&nbsp;000 kr`, the order confirmation injects `&#128230;` entities.
 * So an override is HTML, not text, and **must be sanitised on the way in**
 * (the admin save route), never on the way out. Sanitising at render time
 * would silently mangle the entities the built-in copy depends on.
 */

import { db } from "@repo/database";
import { appSettings } from "@repo/database/schema";
import { eq } from "drizzle-orm";

/** The `app_settings` key. Only `mail` existed before this. */
export const EMAIL_TEMPLATES_KEY = "email_templates";

export type LocaleCode = "sv" | "en";

/** Per-template, per-locale field overrides. Absent field = use the code default. */
export type TemplateOverrides = {
  overrides?: Record<string, Partial<Record<LocaleCode, Record<string, string>>>>;
};

/**
 * Cached briefly rather than read per email.
 *
 * The shipping sweep sends in batches, so a per-send query would mean one
 * round trip per customer for a row that changes a few times a year. Short
 * enough that an edit shows up without a restart.
 */
const CACHE_TTL_MS = 30_000;
let cached: { at: number; value: TemplateOverrides } | null = null;

/** Called by the admin save route so an edit is visible immediately. */
export function invalidateTemplateOverrides(): void {
  cached = null;
}

export async function loadTemplateOverrides(): Promise<TemplateOverrides> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  try {
    const [row] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, EMAIL_TEMPLATES_KEY))
      .limit(1);
    const value = row?.value ? (JSON.parse(row.value) as TemplateOverrides) : {};
    cached = { at: Date.now(), value };
    return value;
  } catch {
    /**
     * A malformed row or an unreachable database must not stop mail going
     * out — the built-in copy is a complete, working set on its own.
     */
    cached = { at: Date.now(), value: {} };
    return {};
  }
}

/**
 * Merge stored overrides over a built-in copy object.
 *
 * Only keys that already exist in `fallback` are considered, so a stale or
 * hand-edited settings row cannot inject fields the template never reads.
 * Non-string values are ignored for the same reason.
 */
export function mergeCopy<T extends Record<string, unknown>>(
  fallback: T,
  override: Record<string, string> | undefined,
): T {
  if (!override) return fallback;
  let changed = false;
  const out: Record<string, unknown> = { ...fallback };

  for (const key of Object.keys(fallback)) {
    const value = override[key];
    if (typeof value !== "string") continue;
    // Blank means "not overridden". Clearing a field in the editor restores
    // the built-in text rather than sending an email with a gap in it.
    if (value.trim() === "") continue;
    if (value === fallback[key]) continue;
    out[key] = value;
    changed = true;
  }

  return changed ? (out as T) : fallback;
}

/**
 * The copy for one template in one locale, with any override applied.
 *
 * Returns the fallback object itself when nothing is overridden, so the common
 * path allocates nothing.
 */
export async function resolveCopy<T extends Record<string, unknown>>(
  templateKey: string,
  locale: LocaleCode,
  fallback: T,
): Promise<T> {
  const all = await loadTemplateOverrides();
  return mergeCopy(fallback, all.overrides?.[templateKey]?.[locale]);
}

/** Synchronous form, for a caller that already loaded the settings. */
export function resolveCopySync<T extends Record<string, unknown>>(
  settings: TemplateOverrides,
  templateKey: string,
  locale: LocaleCode,
  fallback: T,
): T {
  return mergeCopy(fallback, settings.overrides?.[templateKey]?.[locale]);
}
