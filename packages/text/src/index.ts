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

/* ---- country codes as something a person reads ------------------------- */

/**
 * The CLDR label for "region we have no name for". `Intl.DisplayNames` returns
 * it for the reserved code ZZ, in the display language — so it must be read
 * from the formatter rather than hard-coded as a Swedish string.
 */
const unknownRegionLabel = (names: Intl.DisplayNames): string | undefined => {
  try {
    return names.of("ZZ");
  } catch {
    return undefined;
  }
};

/**
 * A country name in `locale` for an ISO 3166-1 alpha-2 code.
 *
 * Falls back to the code itself for anything CLDR has no name for. That
 * matters for one case in particular: `of("ZZ")` answers "okand region", which
 * in a list of countries reads exactly like the bucket of visits whose
 * location could not be determined. Two different unknowns sharing a label is
 * worse than showing the raw code.
 */
export function countryName(code: string, locale = "sv"): string {
  const clean = code?.trim().toUpperCase();
  if (!clean || !/^[A-Z]{2}$/.test(clean)) return code ?? "";
  try {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    const label = names.of(clean);
    if (!label || label === unknownRegionLabel(names)) return clean;
    return label;
  } catch {
    return clean;
  }
}

/**
 * The flag emoji for an alpha-2 code, by offsetting each letter into the
 * regional-indicator block. No image and no lookup table: every valid code
 * produces its own flag, and an invalid one produces nothing rather than a
 * pair of stray letters.
 */
export function countryFlag(code: string): string {
  const clean = code?.trim().toUpperCase();
  if (!clean || !/^[A-Z]{2}$/.test(clean)) return "";
  return String.fromCodePoint(...[...clean].map((ch) => 0x1f1e6 + (ch.charCodeAt(0) - 65)));
}
