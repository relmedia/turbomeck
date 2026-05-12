import DOMPurify from "isomorphic-dompurify";

/** Matches storefront `RichTextContent` / admin product description allowlist. */
const RICH_TEXT_SANITIZE = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "h1", "h2", "h3", "ul", "ol", "li", "a"],
  ALLOWED_ATTR: ["href", "target", "rel"],
};

/**
 * SECURITY (audit L3): for any anchor that opens in a new window, force
 * `rel="noopener noreferrer"`. Without `noopener`, the new tab can call
 * `window.opener.location = ...` and reverse-tabnabbing-phish the user; without
 * `noreferrer`, we leak the current full URL (incl. tokens in some flows) to
 * the target. We unconditionally set both, overwriting any user-supplied `rel`.
 *
 * We do this via a DOMPurify hook so it runs after the allowlist filter and
 * applies whether the input came from an admin (rich-text editor) or some
 * future caller.
 *
 * The hook is registered idempotently with a module-level flag so that
 * dynamically importing this module from many bundle chunks doesn't stack
 * dozens of callbacks on top of each other.
 */
let hooksRegistered = false;
function ensureHooksRegistered() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof Element)) return;
    if (node.tagName !== "A") return;
    const target = node.getAttribute("target");
    // `_blank` is the common one but any non-self target opens a new window.
    const opensNewWindow = !!target && target !== "_self";
    if (opensNewWindow) {
      node.setAttribute("rel", "noopener noreferrer");
    }
    // Force protocol-safety: anchors with javascript:/data:/vbscript: should
    // already be stripped by DOMPurify, but if a future allowlist lets an
    // attacker-controlled `href` through with a weird scheme, drop target so
    // it cannot exploit the (now also missing) opener.
    const href = node.getAttribute("href") || "";
    if (/^\s*(javascript|data|vbscript):/i.test(href)) {
      node.removeAttribute("href");
      node.removeAttribute("target");
    }
  });
}

export function sanitizeRichTextHtml(html: string): string {
  ensureHooksRegistered();
  return DOMPurify.sanitize(html, RICH_TEXT_SANITIZE);
}
