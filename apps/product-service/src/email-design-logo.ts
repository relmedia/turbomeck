/**
 * Puts the shop's own logo at the top of a stored design.
 *
 * Narrowly: inserts a logo row when the design has no logo, and drops the
 * TEXT wordmark once an image logo is present. Rewriting third-party image
 * URLs is a separate step that runs first (see `r2-email-assets.ts` in
 * admin), because it has to download and re-upload and only admin holds
 * those credentials.
 *
 * The split matters for a reason worth recording. An earlier version of this
 * file repointed EVERY `assets.unlayer.com` image at the logo, on the
 * assumption that such an image was always the logo. It is not: four of the
 * live templates also carry a content picture — `thankyou.jpg`, `takk.jpg`,
 * `posten.jpg`, `levererad.jpg` — and that version would have replaced each
 * of them with a second copy of the logo. Deciding which image is the logo
 * now happens in one place, by filename, next to the code that moves it.
 *
 * Operates on the design JSON only. The HTML that is actually emailed is
 * re-exported by the editor afterwards, because only Unlayer can produce it
 * correctly — hand-editing exported email HTML is how layouts quietly break.
 *
 * Pure and idempotent: running it twice is a no-op the second time, which is
 * what makes it safe to press the button again after a partial failure.
 */

import { imageBlock, row, resetIdSequence } from "./email-design-builder.js";
import { getOrderEmailLogoUrl } from "./email-logo.js";

type ImageValues = { src?: { url?: string }; text?: string };
type Content = { type?: string; values?: ImageValues };
type Column = { contents?: Content[] };
type Row = { columns?: Column[] };
type DesignBody = { body?: { rows?: Row[] } };

export type LogoResult = {
  design: Record<string, unknown>;
  /** What was done, for reporting back to the admin. */
  action: "inserted" | "unchanged";
  logoUrl: string;
  /**
   * How many text wordmark blocks were dropped as redundant. Reported
   * separately from `action` because it can happen to a design that already
   * had its logo, which is otherwise "unchanged".
   */
  removedWordmarks: number;
};

function* images(design: DesignBody): Generator<Content> {
  for (const r of design.body?.rows ?? []) {
    for (const c of r.columns ?? []) {
      for (const content of c.contents ?? []) {
        if (content?.type === "image") yield content;
      }
    }
  }
}

/** Tags out, enough to tell a wordmark-only block from prose that mentions us. */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A text block that is nothing but the brand name.
 *
 * Deliberately an exact match on the whole block's visible text, not a
 * substring search: the footer carries "Turbomeck.se — Alla rättigheter
 * förbehållna", and a looser test would delete it. The seeded fallback is a
 * single `<strong>TURBOMECK</strong>` and nothing else, so equality is both
 * sufficient and safe.
 */
function isWordmarkOnly(content: Content): boolean {
  if (content?.type !== "text") return false;
  const html = content.values?.text;
  if (typeof html !== "string") return false;
  return visibleText(html).toUpperCase() === "TURBOMECK";
}

/**
 * Drop the text wordmark once a real logo is in the design.
 *
 * This is the double-branding bug at its source. Twelve templates were seeded
 * before a logo existed, so each got the TEXT fallback from
 * `email-designs-seed.ts`. Later this file started inserting the logo IMAGE —
 * and because it only ever looked for images, it never noticed the text
 * wordmark already sitting there. The result was the brand name twice: once as
 * artwork, once as type.
 *
 * Removes the block, and the row with it when that empties the row, so no
 * stray padding is left where the text was.
 */
function removeWordmarkBlocks(design: DesignBody): number {
  const rows = design.body?.rows;
  if (!Array.isArray(rows)) return 0;

  let removed = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const columns = rows[i]?.columns ?? [];
    for (const column of columns) {
      if (!Array.isArray(column.contents)) continue;
      const before = column.contents.length;
      column.contents = column.contents.filter((c) => !isWordmarkOnly(c));
      removed += before - column.contents.length;
    }
    const nowEmpty =
      columns.length > 0 && columns.every((c) => (c.contents?.length ?? 0) === 0);
    if (nowEmpty) rows.splice(i, 1);
  }
  return removed;
}

export function applyLogoToDesign(input: Record<string, unknown>): LogoResult {
  const logoUrl = getOrderEmailLogoUrl();
  if (!logoUrl) throw new Error("Ingen logotyp är konfigurerad (EMAIL_LOGO_URL saknas)");

  const design = input as DesignBody & Record<string, unknown>;
  const found = [...images(design)];
  const hasLogoImage = found.some((img) => img.values?.src?.url === logoUrl);

  /**
   * The text wordmark goes whenever a logo image is present — the one being
   * inserted below, or one already there. Done before the early return so a
   * design that already had its logo still gets the duplicate text cleaned up;
   * that is the state the live templates are in.
   */
  const removedWordmarks = hasLogoImage ? removeWordmarkBlocks(design) : 0;

  /**
   * Already pointing at our copy — nothing left to insert. Still reported as
   * changed when a wordmark was dropped, so the caller knows to save.
   */
  if (hasLogoImage) {
    return {
      design: input,
      action: removedWordmarks > 0 ? "inserted" : "unchanged",
      logoUrl,
      removedWordmarks,
    };
  }

  /**
   * No logo in the design, so insert one. 180px against a natural 183px wide
   * logo: displayed at its own size rather than upscaled, which is what keeps
   * it from looking soft on a retina screen.
   */
  const body = design.body;
  if (!body || !Array.isArray(body.rows)) {
    throw new Error("Designen saknar rader och kan inte ändras");
  }

  /**
   * Ids only have to be unique within one design, and the sequence is reset
   * per design so two designs processed in the same run do not interfere.
   * Offset past the existing rows so the new ids cannot collide with ids the
   * editor already assigned in this document.
   */
  resetIdSequence();
  const logoRow = row(
    imageBlock(logoUrl, "Turbomeck", { width: 180, padding: "24px 24px 8px" }),
  );
  (logoRow as { id: string }).id = `logo_row_${Date.now()}`;

  body.rows.unshift(logoRow as unknown as Row);

  /**
   * Now that the image is in, the text version is redundant. Run after the
   * insert so an all-text design is cleaned in the same pass.
   */
  const alsoRemoved = removeWordmarkBlocks(design);
  return {
    design: input,
    action: "inserted",
    logoUrl,
    removedWordmarks: removedWordmarks + alsoRemoved,
  };
}
