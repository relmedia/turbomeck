/**
 * Server entry — resolved via the `"default"` export condition for Node /
 * RSC / SSR of "use client" components. Uses `isomorphic-dompurify`, which
 * constructs a jsdom Window so DOMPurify has a DOM to operate on. The
 * jsdom dependency is intentionally confined to this file so it never lands
 * in the browser bundle (see ./browser.js).
 */
import DOMPurify from "isomorphic-dompurify";
import {
  RICH_TEXT_SANITIZE,
  EMAIL_COPY_SANITIZE,
  EMAIL_BODY_SANITIZE,
  registerAnchorRelHook,
} from "./shared.js";

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

/**
 * Sanitise one admin-edited email copy field (heading, lead, note).
 * Inline markup only — the surrounding table shell is not editable.
 * @param {string} html
 */
export function sanitizeEmailCopy(html) {
  ensureHooksRegistered();
  return DOMPurify.sanitize(html, EMAIL_COPY_SANITIZE);
}

/**
 * Sanitise a whole custom email body, which may bring its own blocks.
 * @param {string} html
 */
export function sanitizeEmailBody(html) {
  ensureHooksRegistered();
  return DOMPurify.sanitize(html, EMAIL_BODY_SANITIZE);
}

/**
 * A subject line is injected into the mail header and is never escaped
 * (email.ts builds it with plain concatenation), so it must carry no markup
 * at all — and no CR/LF, which would be header injection.
 * @param {string} text
 */
export function sanitizeEmailSubject(text) {
  ensureHooksRegistered();
  const stripped = DOMPurify.sanitize(String(text), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  // \s+ rather than a CR/LF class: it also collapses tabs and runs of spaces,
  // which a subject line has no use for either.
  return stripped.replace(/\s+/g, " ").trim();
}

export { safeHexColor } from "./shared.js";
