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
 * Looks for an editorial photo for `slug` in public/categories/.
 *
 * Accepts both the bare slug and a descriptive suffix, so a file can be named
 * for what it actually shows:
 *
 *   saab.jpg               -> the Saab card
 *   saab93-burnout.jpg     -> the Saab card
 *   volvo-850-r.webp       -> the Volvo card
 *
 * The character after the slug must not be a letter, so `saab*` cannot claim a
 * hypothetical `saabo` category's image. Matches are sorted so the choice is
 * stable when several files qualify.
 *
 * Resolved on the server rather than layered blindly in CSS: a missing CSS
 * layer is invisible, but it also tells the component nothing, and the two
 * sources need different treatments (photo vs cutout).
 */
function findEditorialImage(slug: string): string | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(EDITORIAL_DIR);
  } catch {
    // No folder (or unreadable) is a normal state, not an error.
    return null;
  }

  const candidates = entries
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      if (!EDITORIAL_EXTENSIONS.has(ext)) return false;
      const base = path.basename(file, path.extname(file)).toLowerCase();
      if (base === slug) return true;
      if (!base.startsWith(slug)) return false;
      const next = base.charAt(slug.length);
      return !/[a-z]/.test(next);
    })
    .sort();

  const chosen = candidates[0];
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

  const out: Record<number, CategoryImage> = {};
  for (const c of categories) {
    if (c.parentId != null) continue;

    const editorial = findEditorialImage(slugOf(c));
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
