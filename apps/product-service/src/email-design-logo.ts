/**
 * Puts the shop's own logo at the top of a stored design.
 *
 * Narrowly: inserts a logo row when the design has no logo. Rewriting
 * third-party image URLs is a separate step that runs first (see
 * `r2-email-assets.ts` in admin), because it has to download and re-upload
 * and only admin holds those credentials.
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

type ImageValues = { src?: { url?: string } };
type Content = { type?: string; values?: ImageValues };
type Column = { contents?: Content[] };
type Row = { columns?: Column[] };
type DesignBody = { body?: { rows?: Row[] } };

export type LogoResult = {
  design: Record<string, unknown>;
  /** What was done, for reporting back to the admin. */
  action: "inserted" | "unchanged";
  logoUrl: string;
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

export function applyLogoToDesign(input: Record<string, unknown>): LogoResult {
  const logoUrl = getOrderEmailLogoUrl();
  if (!logoUrl) throw new Error("Ingen logotyp är konfigurerad (EMAIL_LOGO_URL saknas)");

  const design = input as DesignBody & Record<string, unknown>;
  const found = [...images(design)];

  /**
   * Already pointing at our copy — nothing to do. Checked before anything is
   * mutated so a second run reports "unchanged" rather than reinserting.
   */
  if (found.some((img) => img.values?.src?.url === logoUrl)) {
    return { design: input, action: "unchanged", logoUrl };
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
  return { design: input, action: "inserted", logoUrl };
}
