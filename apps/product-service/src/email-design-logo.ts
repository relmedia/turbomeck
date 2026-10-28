/**
 * Puts the shop's own logo at the top of a stored design.
 *
 * Two situations, found by surveying the live designs:
 *
 *  - Four already show a logo, but load it from `assets.unlayer.com` — the
 *    editor uploaded it there when it was dragged in. That is a third-party
 *    CDN nobody here controls, and if those files are pruned every customer
 *    gets a broken logo in a transactional email. Those are repointed at our
 *    own copy, which is byte-identical, so they do not change appearance.
 *  - Eight have no image at all. Those get a logo row inserted at the top.
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

/** Hosts whose images are a logo we are replacing, not content to keep. */
const FOREIGN_LOGO_HOSTS = ["assets.unlayer.com"];

type ImageValues = { src?: { url?: string } };
type Content = { type?: string; values?: ImageValues };
type Column = { contents?: Content[] };
type Row = { columns?: Column[] };
type DesignBody = { body?: { rows?: Row[] } };

export type LogoResult = {
  design: Record<string, unknown>;
  /** What was done, for reporting back to the admin. */
  action: "repointed" | "inserted" | "unchanged";
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

  const foreign = found.filter((img) => {
    const url = img.values?.src?.url ?? "";
    return FOREIGN_LOGO_HOSTS.some((host) => url.includes(host));
  });

  if (foreign.length > 0) {
    for (const img of foreign) {
      if (img.values?.src) img.values.src.url = logoUrl;
    }
    return { design: input, action: "repointed", logoUrl };
  }

  /**
   * No image anywhere, so insert one. 180px against a natural 183px wide
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
