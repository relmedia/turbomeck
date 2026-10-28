/**
 * HTML -> plain text, with no DOM.
 *
 * Used where we need the *words* of a rich-text field rather than its markup:
 * meta descriptions, JSON-LD `description`, and the server-rendered fallback
 * in RichTextContent.
 *
 * This is NOT a sanitizer and must never feed `dangerouslySetInnerHTML`. Its
 * output is rendered as text (React escapes it) or embedded in JSON, so markup
 * in the input is inert either way — stripping tags here is about readability,
 * not safety. Sanitizing for *display* is still @repo/sanitize-html's job.
 */

/** The handful of entities a WYSIWYG actually emits. */
const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    // Block-level boundaries become spaces so "</p><p>" doesn't glue words.
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Trim to a whole word, for meta descriptions. */
export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
