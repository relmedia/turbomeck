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
