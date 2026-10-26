/**
 * Shared sanitizer config and the rel="noopener noreferrer" hook used by
 * both the browser and the server entry points. The two entries differ only
 * in how they obtain a `Window` for DOMPurify:
 *
 *   - browser.js uses the real browser `window`.
 *   - server.js uses `isomorphic-dompurify`, which builds a jsdom Window.
 *
 * The split exists so the browser bundle never has to resolve `jsdom`
 * (which transitively reaches into undici internals and breaks webpack
 * builds against undici 7.24+).
 */

/** @type {{ ALLOWED_TAGS: string[]; ALLOWED_ATTR: string[]; }} */
export const RICH_TEXT_SANITIZE = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "h1",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "a",
  ],
  ALLOWED_ATTR: ["href", "target", "rel"],
};

/**
 * Allowlist for admin-authored EMAIL copy.
 *
 * Deliberately separate from RICH_TEXT_SANITIZE rather than an extension of
 * it. That list is tuned for product descriptions rendered on a web page and
 * permits no `style`, no `table` and no `img` — run an email template through
 * it and the table-based layout and every inline style are stripped, i.e. the
 * mail arrives unstyled.
 *
 * This list is inline-only on purpose. Email copy fields sit INSIDE a
 * hard-coded table shell, so a stray `<div>` or `<table>` from an editor would
 * break the surrounding layout in Outlook, which is unforgiving about nesting.
 * Headings and lists are therefore absent: the shell already provides them.
 *
 * `style` is allowed because the existing copy relies on inline styling and
 * email clients support nothing else. DOMPurify still parses and rewrites the
 * declarations, so `style="x: y; } body {"` cannot escape the attribute.
 */
/** @type {{ ALLOWED_TAGS: string[]; ALLOWED_ATTR: string[]; }} */
export const EMAIL_COPY_SANITIZE = {
  ALLOWED_TAGS: ["strong", "b", "em", "i", "u", "br", "span", "a"],
  ALLOWED_ATTR: ["href", "target", "rel", "style"],
};

/**
 * Allowlist for a whole custom email BODY, which supplies its own block
 * structure inside the shared shell. Wider than EMAIL_COPY_SANITIZE, and
 * still no `script`, `iframe`, `form` or event handlers — DOMPurify drops
 * `on*` attributes regardless of the allowlist.
 */
/** @type {{ ALLOWED_TAGS: string[]; ALLOWED_ATTR: string[]; }} */
export const EMAIL_BODY_SANITIZE = {
  ALLOWED_TAGS: [
    "p", "br", "strong", "b", "em", "i", "u", "span", "a",
    "h2", "h3", "ul", "ol", "li",
    "table", "thead", "tbody", "tr", "td", "th", "img", "hr",
  ],
  ALLOWED_ATTR: [
    "href", "target", "rel", "style", "src", "alt", "width", "height",
    "align", "valign", "colspan", "rowspan", "cellpadding", "cellspacing", "border",
  ],
};

/**
 * A colour an admin may set, validated rather than sanitised.
 *
 * These values are interpolated straight into `style="background-color: X"`
 * in the shipping notices, so anything but a literal hex colour is an
 * injection into every one of those emails. Returns the fallback on anything
 * that is not exactly `#rgb` or `#rrggbb`.
 *
 * @param {unknown} value
 * @param {string} fallback
 */
export function safeHexColor(value, fallback) {
  return typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
    ? value.trim()
    : fallback;
}

/**
 * SECURITY (audit L3): for any anchor that opens in a new window, force
 * `rel="noopener noreferrer"`. Without `noopener` the new tab can rewrite
 * `window.opener.location`; without `noreferrer` we leak the current URL.
 * Also drops `href` + `target` if a future allowlist tweak lets a
 * `javascript:` / `data:` / `vbscript:` URL through.
 *
 * Duck-typed (nodeType + tagName) so the same hook works against the real
 * browser `Element` and against jsdom's `Element` without coupling to
 * either's type definitions.
 *
 * @param {{ addHook: (name: string, cb: (node: any) => void) => unknown }} DP
 */
export function registerAnchorRelHook(DP) {
  DP.addHook("afterSanitizeAttributes", (node) => {
    if (!node || node.nodeType !== 1 || node.tagName !== "A") return;
    const target = node.getAttribute("target");
    const opensNewWindow = !!target && target !== "_self";
    if (opensNewWindow) {
      node.setAttribute("rel", "noopener noreferrer");
    }
    const href = node.getAttribute("href") || "";
    if (/^\s*(javascript|data|vbscript):/i.test(href)) {
      node.removeAttribute("href");
      node.removeAttribute("target");
    }
  });
}
