/**
 * Checks the logo transform against the designs actually in the database.
 *
 * Deliberately not fixtures. The whole point is to change twelve templates a
 * shop is sending to customers right now, and both cases — a design that
 * already has a logo, and one with no image at all — were discovered by
 * looking at those exact rows. A fixture would only prove the code matches my
 * assumptions about them, and one of those assumptions was wrong: four of
 * these templates also carry a content picture, which an earlier version
 * would have overwritten with the logo.
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
    /**
     * "Has a logo" is decided by filename, the same signal the mirror step
     * uses. Mirroring runs first in production and rewrites a logo URL to the
     * canonical one, so here the pre-mirror filename stands in for it.
     */
    const hasLogoBefore = imagesOf(before).some((i) => /logo|logga/i.test(i.values?.src?.url ?? ""));

    /** Deep copy, so a failed assertion cannot leave a half-changed object. */
    const copy = JSON.parse(JSON.stringify(before)) as Record<string, unknown>;
    const result = applyLogoToDesign(copy);
    actions[result.action] = (actions[result.action] ?? 0) + 1;

    const rowsAfter = rowsOf(result.design).length;
    const after = imagesOf(result.design);
    const label = `${d.name} [${d.locale}]`;

    /** Whatever the route taken, the logo must end up in the design. */
    check(
      `${label}: ends up with a logo`,
      after.some((i) => /logo|logga/i.test(i.values?.src?.url ?? "")),
      result.action,
    );

    if (hasLogoBefore) {
      check(`${label}: left alone, it already has the logo`, result.action === "unchanged", result.action);
      check(`${label}: row count unchanged`, rowsAfter === rowsBefore, { rowsBefore, rowsAfter });
      check(`${label}: image count unchanged`, after.length === imagesBefore, { imagesBefore, after: after.length });

      /**
       * The assertion that matters most here. An earlier version repointed
       * every third-party image at the logo, which would have replaced the
       * content pictures these templates carry — thankyou.jpg, takk.jpg,
       * posten.jpg, levererad.jpg — with a second copy of the logo.
       */
      const contentBefore = imagesOf(before)
        .map((i) => i.values?.src?.url ?? "")
        .filter((u) => !/logo|logga/i.test(u));
      const contentAfter = after.map((i) => i.values?.src?.url ?? "");
      const lost = contentBefore.filter((u) => !contentAfter.includes(u));
      check(`${label}: content images survive untouched`, lost.length === 0, lost);
    } else {
      check(`${label}: inserted a logo row`, result.action === "inserted", result.action);
      check(`${label}: gained exactly one row`, rowsAfter === rowsBefore + 1, { rowsBefore, rowsAfter });
      /** At the top, or it is not a header. */
      const firstRowImages = rowsOf(result.design)[0]?.columns?.[0]?.contents ?? [];
      check(`${label}: the logo is the first block`, firstRowImages[0]?.type === "image");
    }

    /** Running it again must do nothing — the button may be pressed twice. */
    const second = applyLogoToDesign(JSON.parse(JSON.stringify(result.design)));
    check(
      `${label}: a second pass is a no-op`,
      second.action === "unchanged" || hasLogoBefore,
      second.action,
    );
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
