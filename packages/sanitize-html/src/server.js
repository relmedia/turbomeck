/**
 * Server entry — resolved via the `"default"` export condition for Node /
 * RSC / SSR of "use client" components. Uses `isomorphic-dompurify`, which
 * constructs a jsdom Window so DOMPurify has a DOM to operate on. The
 * jsdom dependency is intentionally confined to this file so it never lands
 * in the browser bundle (see ./browser.js).
 */
import DOMPurify from "isomorphic-dompurify";
import { RICH_TEXT_SANITIZE, registerAnchorRelHook } from "./shared.js";

let hooksRegistered = false;
function ensureHooksRegistered() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  registerAnchorRelHook(DOMPurify);
}

/** @param {string} html */
export function sanitizeRichTextHtml(html) {
  ensureHooksRegistered();
  return DOMPurify.sanitize(html, RICH_TEXT_SANITIZE);
}
