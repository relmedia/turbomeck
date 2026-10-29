/**
 * Resolving the design that replaces a transactional email.
 *
 * The mechanics moved to `@repo/email-design` so `@repo/auth` can resolve a
 * design for the sign-in mail too — different app, same rules, and the
 * fallback behaviour is the part that must not drift between them.
 *
 * Re-exported from here because every caller in this service imports this
 * path, and because this is still where "which designs this service sends"
 * is a sensible thing to look for.
 */
export {
  resolveActiveDesign,
  renderDesign,
  invalidateDesignCache,
  type ActiveDesign,
} from "@repo/email-design";
