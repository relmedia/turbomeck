/**
 * Checks the logo transform against the designs actually in the database.
 *
 * Deliberately not fixtures. The whole point is to change twelve templates a
 * shop is sending to customers right now, and the two cases — repoint a
 * third-party URL, insert a row where there is no image — were discovered by
 * looking at those exact rows. A fixture would only prove the code matches my
 * assumptions about them.
 *
 * Reads the designs, transforms them IN MEMORY, and asserts. Writes nothing:
 * the real write happens through the editor, which has to re-export the HTML.
 *
 * Optionally dumps the transformed designs so they can be opened in the live
 * Unlayer editor — a design with a wrong shape does not error, it opens
 * blank, so that check cannot be skipped.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --env-file=apps/product-service/.env \
 *     apps/product-service/src/__verify-design-logo.ts [out-dir]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@repo/database";
import { emailDesigns } from "@repo/database/schema";
import { applyLogoToDesign } from "./email-design-logo.js";
import { getOrderEmailLogoUrl } from "./email-logo.js";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

const outDir = process.argv[2];
if (outDir) mkdirSync(outDir, { recursive: true });

type Row = { columns?: Array<{ contents?: Array<{ type?: string; values?: { src?: { url?: string } } }> }> };
const rowsOf = (d: unknown) => ((d as { body?: { rows?: Row[] } })?.body?.rows ?? []);
const imagesOf = (d: unknown) =>
  rowsOf(d).flatMap((r) => (r.columns ?? []).flatMap((c) => (c.contents ?? []).filter((x) => x?.type === "image")));

async function main() {
  const logoUrl = getOrderEmailLogoUrl();
  check("a logo URL is configured", Boolean(logoUrl), logoUrl);
  check("it points at our own R2, not a third party", !logoUrl.includes("unlayer.com"), logoUrl);

  /** It must actually be served, or twelve emails get a broken image. */
  const res = await fetch(logoUrl, { cache: "no-store" });
  check("the logo is publicly reachable", res.ok, { status: res.status });
  check("and is an image", (res.headers.get("content-type") ?? "").startsWith("image/"), res.headers.get("content-type"));

  const designs = await db
    .select({
      id: emailDesigns.id,
      name: emailDesigns.name,
      locale: emailDesigns.locale,
      isActive: emailDesigns.isActive,
      design: emailDesigns.design,
    })
    .from(emailDesigns);

  check("there are designs to work on", designs.length > 0, designs.length);

  const index: Array<{ file: string; templateKey: string; locale: string }> = [];
  const actions: Record<string, number> = {};

  for (const d of designs) {
    const before = d.design as Record<string, unknown> | null;
    if (!before) {
      check(`${d.name} [${d.locale}]: has a stored design`, false);
      continue;
    }

    const rowsBefore = rowsOf(before).length;
    const imagesBefore = imagesOf(before).length;
    const foreignBefore = imagesOf(before).filter((i) =>
      (i.values?.src?.url ?? "").includes("assets.unlayer.com"),
    ).length;

    /** Deep copy, so a failed assertion cannot leave a half-changed object. */
    const copy = JSON.parse(JSON.stringify(before)) as Record<string, unknown>;
    const result = applyLogoToDesign(copy);
    actions[result.action] = (actions[result.action] ?? 0) + 1;

    const rowsAfter = rowsOf(result.design).length;
    const after = imagesOf(result.design);
    const label = `${d.name} [${d.locale}]`;

    /** Whatever the route taken, the logo must end up in the design. */
    check(`${label}: carries the logo`, after.some((i) => i.values?.src?.url === logoUrl), result.action);
    check(
      `${label}: no third-party image is left`,
      !after.some((i) => (i.values?.src?.url ?? "").includes("assets.unlayer.com")),
    );

    if (foreignBefore > 0) {
      check(`${label}: repointed rather than inserted`, result.action === "repointed", result.action);
      /** Repointing must not restructure anything — same rows, same images. */
      check(`${label}: row count unchanged`, rowsAfter === rowsBefore, { rowsBefore, rowsAfter });
      check(`${label}: image count unchanged`, after.length === imagesBefore, { imagesBefore, after: after.length });
    } else {
      check(`${label}: inserted a logo row`, result.action === "inserted", result.action);
      check(`${label}: gained exactly one row`, rowsAfter === rowsBefore + 1, { rowsBefore, rowsAfter });
      /** At the top, or it is not a header. */
      const firstRowImages = rowsOf(result.design)[0]?.columns?.[0]?.contents ?? [];
      check(`${label}: the logo is the first block`, firstRowImages[0]?.type === "image");
    }

    /** Running it again must do nothing — the button may be pressed twice. */
    const second = applyLogoToDesign(JSON.parse(JSON.stringify(result.design)));
    check(`${label}: a second pass is a no-op`, second.action === "unchanged", second.action);
    check(
      `${label}: and does not add another row`,
      rowsOf(second.design).length === rowsAfter,
      { rowsAfter, again: rowsOf(second.design).length },
    );

    if (outDir) {
      const file = `logo.${d.id}.${d.locale}.json`;
      writeFileSync(join(outDir, file), JSON.stringify(result.design, null, 2), "utf8");
      index.push({ file, templateKey: `${d.name}`, locale: d.locale });
    }
  }

  console.log(`\nactions: ${JSON.stringify(actions)}`);

  if (outDir) {
    writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2), "utf8");
    console.log(`${index.length} transformed designs written to ${outDir}`);
  }

  console.log(`${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
