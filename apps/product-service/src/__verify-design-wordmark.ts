/**
 * Checks that a design ends up with ONE piece of branding, not two.
 *
 * The bug this exists to prevent shipped once already. Twelve templates were
 * seeded before a logo existed, so each carried the TEXT wordmark from
 * `email-designs-seed.ts`. `applyLogoToDesign` later began inserting the logo
 * IMAGE, and because it only ever looked for images it never noticed the text
 * already sitting there — so live mail went out with the brand name twice,
 * once as artwork and once as type.
 *
 * The dangerous half is the cleanup, not the insert: a rule loose enough to
 * catch the wordmark is loose enough to delete the footer, which also says
 * "Turbomeck". So the footer is asserted to survive.
 *
 * Pure — no database, no SMTP, no network.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     apps/product-service/src/__verify-design-wordmark.ts
 */

process.env.EMAIL_LOGO_URL = "https://cdn.example.test/branding/email-logo.png";
const LOGO = process.env.EMAIL_LOGO_URL;

import { applyLogoToDesign } from "./email-design-logo.js";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

/** The seeded fallback, copied from `email-designs-seed.ts` brandRow(). */
const WORDMARK = {
  type: "text",
  values: {
    text: '<p style="line-height: 150%;"><strong style="font-size: 20px; letter-spacing: 1px;">TURBOMECK</strong></p>',
  },
};
/** The seeded footer, which also names the shop and must NOT be touched. */
const FOOTER = {
  type: "text",
  values: {
    text: '<p style="line-height: 150%;">Turbomeck.se — Alla rättigheter förbehållna</p>',
  },
};
const logoImage = () => ({ type: "image", values: { src: { url: LOGO } } });
const design = (...rows: unknown[]) => ({ body: { rows } });
const row = (...contents: unknown[]) => ({ columns: [{ contents }] });

const textsOf = (d: unknown): string[] => {
  const out: string[] = [];
  const body = (d as { body?: { rows?: Array<{ columns?: Array<{ contents?: Array<{ type?: string; values?: { text?: string } }> }> }> } }).body;
  for (const r of body?.rows ?? []) {
    for (const c of r.columns ?? []) {
      for (const content of c.contents ?? []) {
        if (content?.type === "text" && content.values?.text) out.push(content.values.text);
      }
    }
  }
  return out;
};
const imageCount = (d: unknown): number => {
  let n = 0;
  const body = (d as { body?: { rows?: Array<{ columns?: Array<{ contents?: Array<{ type?: string }> }> }> } }).body;
  for (const r of body?.rows ?? []) {
    for (const c of r.columns ?? []) {
      for (const content of c.contents ?? []) if (content?.type === "image") n++;
    }
  }
  return n;
};

/* ---- the live state: logo image AND text wordmark ---------------------- */
{
  const d = design(row(logoImage()), row(WORDMARK), row(FOOTER));
  const res = applyLogoToDesign(d as Record<string, unknown>);

  check("the duplicate text wordmark is removed", res.removedWordmarks === 1, res.removedWordmarks);
  check("no wordmark text survives", !textsOf(res.design).some((t) => t.includes("TURBOMECK")));
  check("the logo image is left alone", imageCount(res.design) === 1);
  check(
    "the footer that also says Turbomeck survives",
    textsOf(res.design).some((t) => t.includes("Alla rättigheter")),
    textsOf(res.design),
  );
  check(
    "it reports a change, so the caller saves",
    res.action !== "unchanged",
    res.action,
  );
  check("the emptied row is dropped, not left as padding", (res.design as { body: { rows: unknown[] } }).body.rows.length === 2);
}

/* ---- a text-only design: logo inserted AND wordmark cleaned ------------ */
{
  const d = design(row(WORDMARK), row(FOOTER));
  const res = applyLogoToDesign(d as Record<string, unknown>);
  check("a text-only design gets a logo image", imageCount(res.design) === 1);
  check("and loses its text wordmark in the same pass", res.removedWordmarks === 1);
  check("reported as inserted", res.action === "inserted", res.action);
}

/* ---- idempotence: the button is pressed twice ------------------------- */
{
  const d = design(row(logoImage()), row(FOOTER));
  const res = applyLogoToDesign(d as Record<string, unknown>);
  check("an already-correct design is untouched", res.action === "unchanged" && res.removedWordmarks === 0, res);
  check("and does not gain a second logo", imageCount(res.design) === 1);

  const twice = applyLogoToDesign(
    applyLogoToDesign(design(row(WORDMARK), row(FOOTER)) as Record<string, unknown>).design,
  );
  check("running it twice leaves exactly one logo", imageCount(twice.design) === 1);
  check("and reports nothing left to do", twice.action === "unchanged", twice.action);
}

/* ---- prose that merely mentions the brand is not branding ------------- */
{
  const PROSE = {
    type: "text",
    values: { text: "<p>Tack för att du handlar hos TURBOMECK och välkommen tillbaka!</p>" },
  };
  const res = applyLogoToDesign(design(row(logoImage()), row(PROSE)) as Record<string, unknown>);
  check(
    "a sentence containing the brand name is kept",
    textsOf(res.design).some((t) => t.includes("välkommen tillbaka")),
    res.removedWordmarks,
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
