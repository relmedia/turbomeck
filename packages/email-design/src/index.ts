/**
 * Resolving and filling an admin-built email design.
 *
 * Shared because three places now need it: the order mails and shipping
 * notices in product-service, and the login link in `@repo/auth`. Those live
 * in different apps and cannot import each other, and the alternative was a
 * third copy of the escaping and fallback rules — which are exactly the rules
 * that must not drift, since they decide what reaches an inbox.
 *
 * The product-specific catalogue (which tokens exist, how an order's lines
 * are rendered) deliberately stays in product-service. This package knows
 * only the mechanics: find the active design, substitute, and refuse anything
 * unusable.
 */

import { db } from "@repo/database";
import { emailDesigns } from "@repo/database/schema";
import { and, eq } from "drizzle-orm";

/* ------------------------------------------------------------------ *
 * Escaping
 * ------------------------------------------------------------------ */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------------ *
 * Substitution
 * ------------------------------------------------------------------ */

export type MergeValues = {
  /** One value each. Always HTML-escaped: these carry user data. */
  scalars: Record<string, string>;
  /** Pre-rendered HTML, injected as-is. Server-produced only. */
  blocks: Record<string, string>;
};

const TOKEN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/**
 * A block token is typed into a text element, and the editor wraps whatever
 * is in a text element in `<p>`. A `<table>` inside a `<p>` is invalid HTML:
 * the browser preview survives it, but Outlook closes the paragraph early and
 * the table lands outside the design's cell at full page width.
 *
 * So when a paragraph contains nothing but one block token — whitespace, a
 * `&nbsp;` and a stray `<br>` from pressing Enter all count as nothing — the
 * paragraph itself is replaced, not its contents. A block token sharing a
 * paragraph with real text is left to the generic pass; that is the admin
 * putting it somewhere it does not belong, and a visibly wrong layout beats
 * silently moving their words.
 *
 * Which tokens are blocks comes from the VALUES rather than a global list, so
 * this works for any email instead of only the order mails it started in.
 */
function unwrapBlockParagraphs(html: string, blocks: Set<string>): string {
  if (blocks.size === 0) return html;
  return html.replace(
    /<p(?=[\s>])[^>]*>((?:\s|&nbsp;|<br\s*\/?>)*)\{\{\s*([a-z0-9_]+)\s*\}\}((?:\s|&nbsp;|<br\s*\/?>)*)<\/p>/gi,
    (whole, _before: string, rawToken: string) =>
      blocks.has(rawToken.toLowerCase()) ? `{{${rawToken.toLowerCase()}}}` : whole,
  );
}

/**
 * Replace every token in a designed email.
 *
 * Scalars are escaped; blocks are not, because the server built them. An
 * unknown token is left alone rather than blanked — a visible `{{typo}}` in a
 * test send is a bug someone fixes, where a silent empty space is one that
 * ships.
 */
export function applyMergeTags(html: string, values: MergeValues): string {
  const blocks = new Set(Object.keys(values.blocks));
  return unwrapBlockParagraphs(html, blocks).replace(TOKEN, (whole, rawToken: string) => {
    const token = rawToken.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(values.blocks, token)) {
      return values.blocks[token] ?? "";
    }
    if (Object.prototype.hasOwnProperty.call(values.scalars, token)) {
      return escapeHtml(values.scalars[token] ?? "");
    }
    return whole;
  });
}

/**
 * Substitution for a subject line.
 *
 * A subject is a mail header, not HTML: `&amp;` would be delivered literally,
 * so values go in unescaped. Block tokens are dropped — a table in a subject
 * line is meaningless — rather than injected as raw markup into an inbox list.
 */
export function applyMergeTagsPlain(text: string, values: MergeValues): string {
  return text.replace(TOKEN, (whole, rawToken: string) => {
    const token = rawToken.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(values.blocks, token)) return "";
    if (Object.prototype.hasOwnProperty.call(values.scalars, token)) {
      return values.scalars[token] ?? "";
    }
    return whole;
  });
}

/** Tokens a design uses that the given catalogue cannot fill. */
export function unknownTokens(html: string, known: Iterable<string>): string[] {
  const catalogue = new Set([...known].map((t) => t.toLowerCase()));
  const found = new Set<string>();
  for (const m of html.matchAll(TOKEN)) {
    const t = m[1]?.toLowerCase();
    if (t && !catalogue.has(t)) found.add(t);
  }
  return [...found];
}

/* ------------------------------------------------------------------ *
 * Resolution
 * ------------------------------------------------------------------ */

export type ActiveDesign = { id: number; subject: string; html: string };

/**
 * Short-lived cache, mirroring `getMailConfig()`.
 *
 * Transactional mail can go out in bursts, and each send would otherwise
 * re-query. 30 seconds is short enough that an admin toggling Aktiv sees it
 * take effect while still on the page, so nobody concludes the switch is
 * broken.
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
      .select({ id: emailDesigns.id, subject: emailDesigns.subject, html: emailDesigns.html })
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
     * An activated design with no HTML is treated as absent. That happens
     * when a design is saved before the editor finished booting, and sending
     * an empty body is worse than sending the built-in template.
     */
    if (row?.html?.trim()) value = { id: row.id, subject: row.subject, html: row.html };
  } catch (error) {
    /**
     * A database hiccup must not stop the mail. Falling back to the compiled
     * template means the recipient still gets their email.
     */
    console.error("[email-design] could not resolve design:", error);
    return null;
  }

  cache.set(key, { at: Date.now(), value });
  return value;
}

/**
 * Fill a design's tokens.
 *
 * Returns null when the design turns out to be unusable, so the caller can
 * fall back rather than send something broken.
 *
 * `required` names tokens the email cannot work without — the login link in a
 * sign-in mail being the clear case. A design missing one is refused
 * outright: an admin who deleted the button would otherwise lock every user
 * out, and no amount of good layout makes up for a sign-in email with nothing
 * to click.
 */
export function renderDesign(
  design: ActiveDesign,
  values: MergeValues,
  templateKey: string,
  options: { required?: string[]; known?: Iterable<string> } = {},
): { subject: string; html: string } | null {
  try {
    for (const token of options.required ?? []) {
      if (!new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "i").test(design.html)) {
        console.warn(
          `[email-design] ${templateKey} design #${design.id} is missing {{${token}}}; using the built-in template`,
        );
        return null;
      }
    }

    const html = applyMergeTags(design.html, values);
    const subject = applyMergeTagsPlain(design.subject, values).trim();
    if (!html.trim()) return null;

    if (options.known) {
      const unknown = unknownTokens(design.html, options.known);
      if (unknown.length > 0) {
        console.warn(
          `[email-design] ${templateKey} design #${design.id} uses unknown tokens: ${unknown.join(", ")}`,
        );
      }
    }

    /**
     * An empty subject falls back with the rest. A mail with no subject looks
     * like spam and several clients file it that way, so it is not worth
     * sending a correct body under one.
     */
    return subject ? { subject, html } : null;
  } catch (error) {
    console.error(`[email-design] ${templateKey} design #${design.id} failed to render:`, error);
    return null;
  }
}
