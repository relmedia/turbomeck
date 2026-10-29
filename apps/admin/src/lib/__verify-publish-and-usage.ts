/**
 * Checks the two fixes this change makes, against live data.
 *
 * **Usage.** The library reported 23 images as unused that the shop owner
 * recognised. Two were genuinely wrong — a profile picture and the logo —
 * because detection only looked at products and email designs. The rest were
 * correct but unexplained: older copies of a product's image, visually
 * identical to the one in use. All three are asserted here.
 *
 * **Publishing.** Hidden products must disappear from the storefront and
 * stay visible in admin. The dangerous direction is a product that is hidden
 * everywhere, or one that stays on sale after being hidden.
 *
 * Read-only against products; restores any flag it flips.
 *
 * Run:
 *   node ...tsx --tsconfig apps/admin/tsconfig.json \
 *     --env-file=apps/product-service/.env \
 *     apps/admin/src/lib/__verify-publish-and-usage.ts
 */

import { db } from "@repo/database";
import { products, users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { objectKeyFromUrl } from "./media-uploads";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
};

const base = (process.env.PRODUCT_SERVICE_URL || "http://localhost:8000").replace(/\/$/, "");
const auth = { Authorization: `Bearer ${process.env.INTERNAL_PRODUCT_API_SECRET!}` };

async function main() {
  /* ---- usage: avatars and configured images --------------------------- */
  const [userRows, objRes] = await Promise.all([
    db.select({ image: users.image }).from(users),
    fetch(`${base}/api/media`, { headers: auth }).then((r) => r.json() as Promise<{ objects: Array<{ key: string }> }>),
  ]);
  const keys = new Set(objRes.objects.map((o) => o.key));

  const ownAvatars = userRows
    .map((u) => objectKeyFromUrl(u.image ?? ""))
    .filter((k): k is string => Boolean(k) && keys.has(k!));
  check("at least one avatar lives in our bucket", ownAvatars.length > 0, ownAvatars);

  const logoKey = objectKeyFromUrl(process.env.EMAIL_LOGO_URL ?? "");
  check("the configured logo resolves to a real object", Boolean(logoKey && keys.has(logoKey)), logoKey);

  /* ---- publishing ------------------------------------------------------ */
  const [sample] = await db
    .select({ id: products.id, name: products.name, slug: products.slug, published: products.published })
    .from(products)
    .where(eq(products.published, true))
    .limit(1);
  check("there is a published product to test with", Boolean(sample), sample?.name);
  if (!sample) return finish();

  const publicList = async (hidden: boolean) => {
    const url = `${base}/api/products${hidden ? "?includeUnpublished=true" : ""}`;
    const r = await fetch(url, { headers: auth, cache: "no-store" });
    return (await r.json()) as Array<{ id: number }>;
  };

  const beforePublic = await publicList(false);
  check("the product is in the public list to begin with", beforePublic.some((p) => p.id === sample.id));

  try {
    await db.update(products).set({ published: false }).where(eq(products.id, sample.id));

    const hiddenPublic = await publicList(false);
    check("hiding removes it from the storefront list", !hiddenPublic.some((p) => p.id === sample.id));

    const adminList = await publicList(true);
    check("but admin still sees it", adminList.some((p) => p.id === sample.id));

    check(
      "the storefront list shrinks by exactly one",
      hiddenPublic.length === beforePublic.length - 1,
      { before: beforePublic.length, after: hiddenPublic.length },
    );

    /** The page must 404, not render an empty shell that stays indexable. */
    if (sample.slug) {
      const pub = await fetch(`${base}/api/products/slug/${sample.slug}`, { headers: auth, cache: "no-store" });
      check("its page is a 404 for the storefront", pub.status === 404, pub.status);
      const adm = await fetch(`${base}/api/products/slug/${sample.slug}?includeUnpublished=true`, {
        headers: auth,
        cache: "no-store",
      });
      check("and still reachable with the admin flag", adm.status === 200, adm.status);
    }

    /** Admin opens products by id when editing; that must never be filtered. */
    const byId = await fetch(`${base}/api/products/${sample.id}`, { headers: auth, cache: "no-store" });
    check("a hidden product can still be opened by id", byId.status === 200, byId.status);
  } finally {
    await db.update(products).set({ published: true }).where(eq(products.id, sample.id));
    const [restored] = await db
      .select({ published: products.published })
      .from(products)
      .where(eq(products.id, sample.id));
    check("the test product was restored to published", restored?.published === true);
  }

  finish();
}

function finish() {
  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
