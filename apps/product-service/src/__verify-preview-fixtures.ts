/**
 * Checks that a preview leaves nothing unfilled.
 *
 * The failure this exists to catch is quiet: a token with no sample value
 * survives into the test mail as a literal `{{order_total}}`, and the admin
 * concludes the whole feature is broken. So every catalogued token is asserted
 * to come back with a value, and a design using all of them is asserted to
 * render clean.
 *
 * Sends no mail and touches no database — `sampleMergeValues` is pure.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     apps/product-service/src/__verify-preview-fixtures.ts
 */

import { sampleMergeValues, previewBanner } from "./email-preview-fixtures.js";
import { MERGE_TAGS, applyMergeTags, applyMergeTagsPlain, unknownTokens } from "./email-merge-tags.js";
import { seedTemplates } from "./email-designs-seed.js";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

for (const locale of ["sv", "en"] as const) {
  const values = sampleMergeValues(locale);

  /* ---- every token has a value ---------------------------------------- */
  const missingScalars = MERGE_TAGS.filter(
    (t) => t.kind === "scalar" && values.scalars[t.token] === undefined,
  ).map((t) => t.token);
  check(`${locale}: every scalar token has a sample`, missingScalars.length === 0, missingScalars);

  const missingBlocks = MERGE_TAGS.filter(
    (t) => t.kind === "block" && values.blocks[t.token] === undefined,
  ).map((t) => t.token);
  check(`${locale}: every block token has a renderer`, missingBlocks.length === 0, missingBlocks);

  /**
   * Blank is allowed for a few scalars by design — an export order has no VAT
   * and a domestic one no discount — but a preview of EVERY token blank would
   * look broken, so the bulk must carry something.
   */
  const scalarCount = MERGE_TAGS.filter((t) => t.kind === "scalar").length;
  const filled = MERGE_TAGS.filter(
    (t) => t.kind === "scalar" && (values.scalars[t.token] ?? "").trim().length > 0,
  ).length;
  check(`${locale}: most scalars carry visible data`, filled >= scalarCount - 2, {
    filled,
    of: scalarCount,
  });

  /* ---- the blocks actually render something --------------------------- */
  check(
    `${locale}: the items block lists both fixture products`,
    (values.blocks.order_items ?? "").includes("Turbo Garrett GT2860RS") &&
      (values.blocks.order_items ?? "").includes("Oljeslang"),
  );
  check(
    `${locale}: the items block multiplies quantity (375 x 2)`,
    (values.blocks.order_items ?? "").replace(/\u00a0/gu, " ").includes("750"),
  );
  check(
    `${locale}: the totals block has a total`,
    (values.blocks.order_totals ?? "").replace(/\u00a0/gu, " ").includes("16 989"),
  );
  /**
   * Counted by the numbers in the step badges, not by `<tr>`: each step nests
   * a one-row table for its circle, so a row count sees six and not three.
   */
  const steps = values.blocks.next_steps ?? "";
  check(
    `${locale}: the steps block has three numbered steps`,
    [">1<", ">2<", ">3<"].every((n) => steps.includes(n)) && !steps.includes(">4<"),
  );

  /* ---- a design using every token renders clean ----------------------- */
  const everyToken = MERGE_TAGS.map((t) =>
    t.kind === "block" ? `<p>{{${t.token}}}</p>` : `<p>x {{${t.token}}} y</p>`,
  ).join("\n");
  const rendered = applyMergeTags(everyToken, values);
  check(`${locale}: no token survives a kitchen-sink design`, !rendered.includes("{{"), rendered.match(/\{\{[^}]*\}\}/g) ?? undefined);
  check(`${locale}: no block table is left inside a paragraph`, !/<p[^>]*>\s*<table/i.test(rendered));

  /* ---- the seeded designs, which is what will actually be previewed --- */
  for (const seed of seedTemplates().filter((t) => t.locale === locale)) {
    const body = designText(seed.design);
    const out = applyMergeTags(body, values);
    check(
      `${locale}: ${seed.templateKey} previews with no leftover tokens`,
      !out.includes("{{"),
      out.match(/\{\{[^}]*\}\}/g) ?? undefined,
    );
    check(
      `${locale}: ${seed.templateKey} subject previews cleanly`,
      !applyMergeTagsPlain(seed.subject, values).includes("{{"),
      applyMergeTagsPlain(seed.subject, values),
    );
    check(
      `${locale}: ${seed.templateKey} uses no unknown token`,
      unknownTokens(body).length === 0,
      unknownTokens(body),
    );
  }

  /* ---- the banner ------------------------------------------------------ */
  const banner = previewBanner(locale);
  check(`${locale}: the banner says it is a test`, /test/i.test(banner));
  check(
    `${locale}: the banner is in the right language`,
    locale === "sv" ? banner.includes("Testmejl") : banner.includes("Test email"),
  );
}

/** The text and link content of a design, as the preview substitution sees it. */
function designText(design: Record<string, unknown>): string {
  const parts: string[] = [];
  const body = design.body as {
    rows: Array<{ columns: Array<{ contents: Array<Record<string, unknown>> }> }>;
  };
  for (const row of body.rows) {
    for (const col of row.columns) {
      for (const content of col.contents) {
        const values = content.values as Record<string, unknown> | undefined;
        if (!values) continue;
        if (typeof values.text === "string") parts.push(values.text);
        const href = values.href as { values?: { href?: string } } | undefined;
        if (href?.values?.href) parts.push(`<a href="${href.values.href}">cta</a>`);
      }
    }
  }
  return parts.join("\n");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
