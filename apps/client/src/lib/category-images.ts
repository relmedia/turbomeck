import fs from "node:fs";
import path from "node:path";
import type { ProductType } from "@/types";

/**
 * Background imagery for the top-level category cards.
 *
 * SERVER ONLY — this module touches the filesystem. Import it from server
 * components (`app/page.tsx`) and pass the result to the client component as
 * props.
 *
 * Two sources, and they are presented differently on purpose:
 *
 *   "editorial"  an photo the shop drops at public/categories/<slug>.jpg —
 *                e.g. an actual Saab 9-3. Rendered full-bleed under a scrim,
 *                the way a hero photo wants to be seen.
 *   "product"    the first real product image from that category. These are
 *                cutouts shot on white, so stretching one edge-to-edge looks
 *                like a washed-out blob. Rendered instead as a contained
 *                cutout anchored to the corner, which is how a parts shop
 *                shows a part.
 *
 * With neither, the card is the plain charcoal panel and nothing is missing.
 */

export type CategoryNode = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

export type CategoryImage = {
  src: string;
  kind: "editorial" | "product";
};

/** Extensions accepted for an editorial override. */
const EDITORIAL_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

const EDITORIAL_DIR = path.join(process.cwd(), "public", "categories");

/**
 * Finds the editorial photo for `slug` in public/categories/.
 *
 * Shop owners name files after what the photo shows, not after our slugs, so
 * the slug may appear anywhere in the name:
 *
 *   turbo.jpg                     -> Turbo
 *   saab93-burnout.jpg            -> Saab      (slug first)
 *   garret-turbo-category.jpg     -> Turbo     (slug in the middle)
 *
 * Two rules keep that from becoming ambiguous:
 *
 *   1. The slug must be delimited by non-letters, so `saab*` cannot claim a
 *      hypothetical `saabo` category's photo.
 *   2. A file that STARTS with another category's slug belongs to that
 *      category and is never offered to a second one — otherwise
 *      `volvo-940-turbo.jpg` would be claimed by both Volvo and Turbo.
 *
 * A name match beats a loose one, then the shortest filename wins, so the
 * choice is deterministic no matter what order the filesystem returns.
 *
 * Resolved on the server rather than layered blindly in CSS: a missing CSS
 * layer is invisible, but it also tells the component nothing, and the two
 * sources need different treatments (photo vs cutout).
 */
function isDelimited(base: string, slug: string): boolean {
  const i = base.indexOf(slug);
  if (i === -1) return false;
  const before = i === 0 ? "" : base.charAt(i - 1);
  const after = base.charAt(i + slug.length);
  return !/[a-z]/.test(before) && !/[a-z]/.test(after);
}

function findEditorialImage(slug: string, allSlugs: string[]): string | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(EDITORIAL_DIR);
  } catch {
    // No folder (or unreadable) is a normal state, not an error.
    return null;
  }

  const images = entries.filter((file) =>
    EDITORIAL_EXTENSIONS.has(path.extname(file).toLowerCase()),
  );

  /** Which category a filename declares by starting with its slug, if any. */
  const ownerOf = (base: string): string | undefined =>
    allSlugs.find((s) => base.startsWith(s) && isDelimited(base, s));

  const byLengthThenName = (a: string, b: string) =>
    a.length - b.length || a.localeCompare(b);

  const starts: string[] = [];
  const contains: string[] = [];

  for (const file of images) {
    const base = path.basename(file, path.extname(file)).toLowerCase();
    if (base === slug || (base.startsWith(slug) && isDelimited(base, slug))) {
      starts.push(file);
      continue;
    }
    if (!isDelimited(base, slug)) continue;
    // Rule 2: don't poach a file that another category already owns.
    const owner = ownerOf(base);
    if (owner && owner !== slug) continue;
    contains.push(file);
  }

  const chosen =
    starts.sort(byLengthThenName)[0] ?? contains.sort(byLengthThenName)[0];
  return chosen ? `/categories/${chosen}` : null;
}

export function buildCategoryImageMap(
  categories: CategoryNode[],
  products: ProductType[],
  slugOf: (c: CategoryNode) => string,
): Record<number, CategoryImage> {
  const childrenOf = new Map<number, number[]>();
  for (const c of categories) {
    if (c.parentId == null) continue;
    const list = childrenOf.get(c.parentId) ?? [];
    list.push(c.id);
    childrenOf.set(c.parentId, list);
  }

  const firstImageByCategory = new Map<number, string>();
  for (const product of products) {
    const image = product.images?.default || product.galleryImages?.[0];
    if (!image || image === "/logo.svg") continue;
    for (const id of product.categoryIds ?? []) {
      if (!firstImageByCategory.has(id)) firstImageByCategory.set(id, image);
    }
  }

  const topLevelSlugs = categories
    .filter((c) => c.parentId == null)
    .map((c) => slugOf(c).toLowerCase());

  const out: Record<number, CategoryImage> = {};
  for (const c of categories) {
    if (c.parentId != null) continue;

    const editorial = findEditorialImage(slugOf(c).toLowerCase(), topLevelSlugs);
    if (editorial) {
      out[c.id] = { src: editorial, kind: "editorial" };
      continue;
    }

    // Prefer an image tagged directly on the parent, then any child's.
    const direct = firstImageByCategory.get(c.id);
    if (direct) {
      out[c.id] = { src: direct, kind: "product" };
      continue;
    }
    for (const childId of childrenOf.get(c.id) ?? []) {
      const fromChild = firstImageByCategory.get(childId);
      if (fromChild) {
        out[c.id] = { src: fromChild, kind: "product" };
        break;
      }
    }
  }
  return out;
}
