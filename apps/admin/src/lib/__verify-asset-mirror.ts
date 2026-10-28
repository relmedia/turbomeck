/**
 * Checks the image mirror against a real third-party image.
 *
 * The part that cannot be proved offline: fetch something from Unlayer's CDN,
 * put it in our bucket, and confirm the bucket serves the same bytes back.
 * Everything downstream assumes that works.
 *
 * Uses a content image from a live template — `takk.jpg` — because that is
 * exactly what will run when the button is pressed, and because the earlier
 * bug was about content images specifically.
 *
 * The key is derived from the source URL, so running this twice overwrites
 * one object rather than accumulating copies.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --tsconfig apps/admin/tsconfig.json --env-file=apps/admin/.env \
 *     apps/admin/src/lib/__verify-asset-mirror.ts
 */

import { isAssetMirrorConfigured, isForeignImage, looksLikeLogo, mirrorImageToR2, mirrorDesignImages } from "./r2-email-assets";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
};

const CONTENT = "https://assets.unlayer.com/projects/0/1793208436902-takk.jpg";
const LOGO = "https://assets.unlayer.com/projects/0/1793122484546-turbologo.png";
const CANONICAL = process.env.EMAIL_LOGO_URL ?? "";

async function main() {
  check("the mirror is configured", isAssetMirrorConfigured());
  check("a canonical logo URL is set", CANONICAL.length > 0, CANONICAL);

  /* ---- classification: the distinction the earlier bug got wrong ------- */
  check("a logo filename is recognised as the logo", looksLikeLogo(LOGO));
  check("a content image is NOT treated as the logo", !looksLikeLogo(CONTENT));
  for (const u of [
    "https://assets.unlayer.com/projects/0/x-thankyou.jpg",
    "https://assets.unlayer.com/projects/0/x-posten.jpg",
    "https://assets.unlayer.com/projects/0/x-levererad.jpg",
    "https://assets.unlayer.com/projects/0/x-takk.jpg",
  ]) {
    check(`content image stays content: ${u.split("/").pop()}`, !looksLikeLogo(u));
  }
  check("an unlayer URL is foreign", isForeignImage(CONTENT));
  check("our own R2 URL is not foreign", !isForeignImage(CANONICAL), CANONICAL);

  /* ---- the real copy --------------------------------------------------- */
  const source = await fetch(CONTENT, { cache: "no-store" });
  check("the source image is reachable", source.ok, { status: source.status });
  const sourceBytes = Buffer.from(await source.arrayBuffer()).length;

  const mirrored = await mirrorImageToR2(CONTENT);
  console.log(`       mirrored -> ${mirrored}`);
  check("the new URL is on our own host", !isForeignImage(mirrored));

  const served = await fetch(mirrored, { cache: "no-store" });
  check("our copy is served", served.ok, { status: served.status });
  const servedBytes = Buffer.from(await served.arrayBuffer()).length;
  check("byte-identical to the original", servedBytes === sourceBytes, { sourceBytes, servedBytes });
  check("and still an image", (served.headers.get("content-type") ?? "").startsWith("image/"), served.headers.get("content-type"));

  /** Deterministic key: the same source must not pile up copies. */
  const again = await mirrorImageToR2(CONTENT);
  check("re-mirroring yields the same URL", again === mirrored, { mirrored, again });

  /* ---- a whole design -------------------------------------------------- */
  const design = {
    body: {
      rows: [
        { columns: [{ contents: [{ type: "image", values: { src: { url: LOGO } } }] }] },
        { columns: [{ contents: [{ type: "image", values: { src: { url: CONTENT } } }] }] },
        { columns: [{ contents: [{ type: "text", values: { text: "<p>hej</p>" } }] }] },
      ],
    },
  };
  const report = await mirrorDesignImages(design as never, CANONICAL);
  check("the logo was pointed at the canonical URL", report.movedToLogo === 1, report.movedToLogo);
  check("the content image was copied, not replaced", report.mirrored === 1, report.mirrored);
  check("no failures", report.failures.length === 0, report.failures);

  const urls = design.body.rows
    .flatMap((r) => r.columns.flatMap((c) => c.contents))
    .filter((c) => c.type === "image")
    .map((c) => (c as { values: { src: { url: string } } }).values.src.url);
  check("the logo is now canonical", urls[0] === CANONICAL, urls[0]);
  check("the content image is NOT the logo", urls[1] !== CANONICAL, urls[1]);
  check("and nothing points at unlayer any more", urls.every((u) => !isForeignImage(u)), urls);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
