/**
 * Browser entry — resolved via the `"browser"` export condition for the
 * client bundle. Pulls only `dompurify` (uses the real `window`) so the
 * client bundle never has to resolve `jsdom`.
 */
import DOMPurify from "dompurify";
import { RICH_TEXT_SANITIZE, registerAnchorRelHook } from "./shared.js";

let hooksRegistered = false;
function ensureHooksRegistered() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  registerAnchorRelHook(DOMPurify);
}

/** @param {string} html */
export function sanitizeRichTextHtml(html) {
  // Safety net: if this file is somehow loaded server-side (conditional
  // exports misconfigured by a downstream bundler) we return "" rather than
  // leaking unsanitized HTML. DOMPurify on a `window`-less `globalThis`
  // would throw — returning "" is the strictly safer default.
  if (typeof window === "undefined") return "";
  ensureHooksRegistered();
  return DOMPurify.sanitize(html, RICH_TEXT_SANITIZE);
}
