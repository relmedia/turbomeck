/**
 * HTML escaping for email rendering.
 *
 * Its own module purely to keep the dependency graph acyclic: the merge-tag
 * layer needs it, and `email.ts` needs the merge-tag layer. Importing it from
 * `email.ts` made those two modules import each other, which ESM tolerates
 * only as long as nothing is used during module evaluation — a trap worth not
 * leaving set.
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
