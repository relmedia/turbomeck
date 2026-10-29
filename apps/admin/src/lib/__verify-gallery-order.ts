/**
 * Checks the gallery ordering against the storefront's own rule.
 *
 * The editor presents one ordered list; the database keeps `image` and
 * `thumbnails`. Every save crosses that boundary, and the failure it invites
 * is quiet: an image that vanishes, or one that shows in admin but not on the
 * product page. Neither throws.
 *
 * So the reference here is the storefront's line, copied verbatim —
 * `galleryImages = [mainImg, ...thumbnails.filter(t => t !== mainImg)]`
 * (`apps/client/src/lib/api.ts:101`). What the admin arranges has to equal
 * what the customer gets, for every arrangement.
 *
 * Pure — no database, no network.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --tsconfig apps/admin/tsconfig.json \
 *     apps/admin/src/lib/__verify-gallery-order.ts
 */

import { toGallery, fromGallery, type GalleryValue } from "@/components/ProductGalleryOrder";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

/**
 * The storefront's rule, verbatim. This is the thing being matched.
 *
 * Note the trim: it was added to `api.ts` BECAUSE this harness caught the
 * difference. The original kept a whitespace-only entry, which would render
 * as a broken image tile, and the admin editor dropped it — so what the admin
 * arranged was not quite what shipped.
 */
function storefrontGallery(v: GalleryValue): string[] {
  const mainImg = v.image ?? "";
  const thumbnails = v.thumbnails ?? [];
  return [mainImg, ...thumbnails.filter((t) => t !== mainImg)]
    .map((u) => (u ?? "").trim())
    .filter(Boolean);
}

/** Reordering, as the component does it. */
function move(images: string[], from: number, to: number): string[] {
  const next = [...images];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

const A = "/uploads/a.png";
const B = "/uploads/b.png";
const C = "/uploads/c.png";
const D = "/uploads/d.png";

/* ---- what admin shows equals what the customer gets -------------------- */
{
  const cases: Array<[string, GalleryValue]> = [
    ["a normal product", { image: A, thumbnails: [B, C] }],
    ["one image only", { image: A, thumbnails: [] }],
    ["no main image yet", { image: null, thumbnails: [B, C] }],
    ["nothing at all", { image: null, thumbnails: [] }],
    ["main repeated in thumbnails", { image: A, thumbnails: [A, B] }],
    ["blank entries", { image: "", thumbnails: ["", B, "  "] }],
  ];
  for (const [label, value] of cases) {
    const admin = toGallery(value);
    const customer = storefrontGallery(value);
    check(`admin matches the storefront: ${label}`, admin.join("|") === customer.join("|"), {
      admin,
      customer,
    });
  }
}

/* ---- the round trip loses nothing -------------------------------------- */
{
  const starting: GalleryValue = { image: A, thumbnails: [B, C, D] };
  const list = toGallery(starting);
  check("every image survives the trip out", list.length === 4, list);

  const back = fromGallery(list);
  check("the main image comes back", back.image === A, back.image);
  check("and the rest in order", back.thumbnails.join("|") === [B, C, D].join("|"), back.thumbnails);
  check(
    "the stored shape round-trips exactly",
    toGallery(back).join("|") === list.join("|"),
  );
}

/* ---- reordering is what picks the card image --------------------------- */
{
  const start: GalleryValue = { image: A, thumbnails: [B, C, D] };
  const list = toGallery(start);

  /** Dragging C to the front must make C the stored main image. */
  const promoted = fromGallery(move(list, 2, 0));
  check("dragging an image to the front makes it the main image", promoted.image === C, promoted.image);
  check(
    "and the others keep their relative order",
    promoted.thumbnails.join("|") === [A, B, D].join("|"),
    promoted.thumbnails,
  );
  check(
    "the customer then sees it first",
    storefrontGallery(promoted)[0] === C,
    storefrontGallery(promoted),
  );

  /** Moving the main image away promotes whatever is now first. */
  const demoted = fromGallery(move(list, 0, 3));
  check("moving the main image back promotes the next one", demoted.image === B, demoted.image);
  check("and the old main is still in the gallery", toGallery(demoted).includes(A));

  /** No arrangement may lose or duplicate a picture. */
  for (let from = 0; from < list.length; from++) {
    for (let to = 0; to < list.length; to++) {
      const result = toGallery(fromGallery(move(list, from, to)));
      const sameSet =
        result.length === list.length && [...result].sort().join("|") === [...list].sort().join("|");
      if (!sameSet) {
        check(`move ${from}->${to} keeps every image`, false, result);
      }
    }
  }
  check("every possible move keeps all four images", true);
}

/* ---- removal ------------------------------------------------------------ */
{
  const list = toGallery({ image: A, thumbnails: [B, C] });

  const withoutMain = fromGallery(list.filter((_, i) => i !== 0));
  check("removing the main image promotes the next", withoutMain.image === B, withoutMain.image);
  check("and keeps the remainder", withoutMain.thumbnails.join("|") === C, withoutMain.thumbnails);

  const withoutLast = fromGallery(list.filter((_, i) => i !== 2));
  check("removing a thumbnail leaves the main alone", withoutLast.image === A);

  const emptied = fromGallery([]);
  check("removing everything clears the main image", emptied.image === null, emptied);
  check("and leaves no thumbnails", emptied.thumbnails.length === 0);
}

/* ---- duplicates --------------------------------------------------------- */
{
  /**
   * The storefront drops a thumbnail identical to the main image, so showing
   * it in admin would offer a tile no customer ever sees.
   */
  const list = toGallery({ image: A, thumbnails: [A, B, A] });
  check("a repeated image appears once", list.join("|") === [A, B].join("|"), list);
  check("and the stored shape has no repeat", fromGallery(list).thumbnails.join("|") === B);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
