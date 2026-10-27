/**
 * Resolves the visually-built design that replaces a transactional email.
 *
 * A design only takes over when an admin has explicitly activated one for the
 * template and locale in question. Everything else — no design, a different
 * locale, activation switched off — falls through to the compiled template,
 * which is what keeps every email working with an empty table.
 *
 * Deliberately below `email.ts` in the dependency graph: it knows how to find
 * and fill a design, and nothing about SMTP or about any particular email's
 * content.
 */

import { db } from "@repo/database";
import { emailDesigns } from "@repo/database/schema";
import { and, eq } from "drizzle-orm";
import {
  applyMergeTags,
  applyMergeTagsPlain,
  unknownTokens,
  type MergeValues,
} from "./email-merge-tags.js";

export type ActiveDesign = { id: number; subject: string; html: string };

/**
 * Short-lived cache, mirroring `getMailConfig()`.
 *
 * Transactional mail can go out in bursts (a status poll that finds four
 * parcels at once), and each send would otherwise re-query. 30 seconds is
 * short enough that an admin toggling Aktiv sees it take effect while they
 * are still on the page, so nobody concludes the switch is broken.
 */
const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: ActiveDesign | null }>();

/** Called when a design is saved, so a just-activated design is used at once. */
export function invalidateDesignCache(): void {
  cache.clear();
}

export async function resolveActiveDesign(
  templateKey: string,
  locale: string,
): Promise<ActiveDesign | null> {
  const key = `${templateKey}:${locale}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value: ActiveDesign | null = null;
  try {
    const [row] = await db
      .select({
        id: emailDesigns.id,
        subject: emailDesigns.subject,
        html: emailDesigns.html,
      })
      .from(emailDesigns)
      .where(
        and(
          eq(emailDesigns.templateKey, templateKey),
          eq(emailDesigns.locale, locale),
          eq(emailDesigns.isActive, true),
        ),
      )
      .limit(1);
    /**
     * An activated design with no HTML is treated as absent. That happens when
     * a design is saved before the editor finished booting, and sending an
     * empty body to a customer is worse than sending the built-in template.
     */
    if (row?.html?.trim()) value = { id: row.id, subject: row.subject, html: row.html };
  } catch (error) {
    /**
     * A database hiccup must not stop the mail. Falling back to the compiled
     * template means the customer still gets their confirmation.
     */
    console.error("[email-designed] could not resolve design:", error);
    return null;
  }

  cache.set(key, { at: Date.now(), value });
  return value;
}

/**
 * Fill a design's tokens.
 *
 * Returns null when the design turns out to be unusable, so the caller can
 * fall back rather than send something broken. Unknown tokens are logged but
 * not fatal: they survive visibly into the mail, which is how a typo gets
 * noticed and fixed instead of silently emptying a line.
 */
export function renderDesign(
  design: ActiveDesign,
  values: MergeValues,
  templateKey: string,
): { subject: string; html: string } | null {
  try {
    const html = applyMergeTags(design.html, values);
    const subject = applyMergeTagsPlain(design.subject, values).trim();
    if (!html.trim()) return null;

    const unknown = unknownTokens(design.html);
    if (unknown.length > 0) {
      console.warn(
        `[email-designed] ${templateKey} design #${design.id} uses unknown tokens: ${unknown.join(", ")}`,
      );
    }
    /**
     * An empty subject falls back with the rest. A mail with no subject looks
     * like spam and several clients file it that way, so it is not worth
     * sending a correct body under one.
     */
    return subject ? { subject, html } : null;
  } catch (error) {
    console.error(`[email-designed] ${templateKey} design #${design.id} failed to render:`, error);
    return null;
  }
}
