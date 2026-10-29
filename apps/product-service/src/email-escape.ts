/**
 * Moved to `@repo/email-design`, where the substitution that uses it lives,
 * so `@repo/auth` can share one implementation instead of a third copy.
 *
 * Re-exported here because every existing import points at this path.
 */
export { escapeHtml } from "@repo/email-design";
