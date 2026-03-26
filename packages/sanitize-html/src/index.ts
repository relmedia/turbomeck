import DOMPurify from "isomorphic-dompurify";

/** Matches storefront `RichTextContent` / admin product description allowlist. */
const RICH_TEXT_SANITIZE = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "h1", "h2", "h3", "ul", "ol", "li", "a"],
  ALLOWED_ATTR: ["href", "target"],
};

export function sanitizeRichTextHtml(html: string): string {
  return DOMPurify.sanitize(html, RICH_TEXT_SANITIZE);
}
