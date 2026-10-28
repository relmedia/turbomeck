/**
 * Moved to `@repo/text` so admin can compute a meta-description preview with
 * the exact same code the page uses. Two copies would drift, and a preview
 * that disagrees with what actually ships is worse than no preview.
 *
 * Re-exported here so the existing call sites keep working unchanged.
 */
export { htmlToText, truncateAtWord } from "@repo/text";
