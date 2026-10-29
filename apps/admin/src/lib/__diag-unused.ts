import { db } from "@repo/database";
import { products, users } from "@repo/database/schema";
import { objectKeyFromUrl } from "./media-uploads";

async function main() {
  const base = (process.env.PRODUCT_SERVICE_URL || "http://localhost:8000").replace(/\/$/, "");
  const res = await fetch(`${base}/api/media`, {
    headers: { Authorization: `Bearer ${process.env.INTERNAL_PRODUCT_API_SECRET!}` },
  });
  const { objects } = (await res.json()) as { objects: Array<{ key: string }> };
  const keys = new Set(objects.map((o) => o.key));

  const [prods, users] = await Promise.all([
    db.select({ image: products.image, thumbnails: products.thumbnails }).from(products),
    db.select({ image: users.image }).from(users),
  ]);

  const used = new Set<string>();
  for (const p of prods) {
    const k = objectKeyFromUrl(p.image ?? "");
    if (k) used.add(k);
    for (const t of (p.thumbnails as string[] | null) ?? []) {
      const tk = objectKeyFromUrl(t);
      if (tk) used.add(tk);
    }
  }

  const pngs = [...keys].filter((k) => k.endsWith(".png") && !used.has(k));
  const withAvifSibling = pngs.filter((k) => keys.has(k.replace(/\.png$/, ".avif")));
  const siblingUsed = withAvifSibling.filter((k) => used.has(k.replace(/\.png$/, ".avif")));

  console.log(`unused .png files: ${pngs.length}`);
  console.log(`  ...with an .avif sibling in the bucket: ${withAvifSibling.length}`);
  console.log(`  ...whose .avif sibling IS used: ${siblingUsed.length}`);
  console.log(`  ...with no sibling at all: ${pngs.filter((k) => !keys.has(k.replace(/\.png$/, ".avif"))).length}`);

  console.log(`\nuser avatars referenced in the user table: ${users.filter((u) => u.image).length}`);
  for (const u of users.filter((x) => x.image).slice(0, 3)) {
    const k = objectKeyFromUrl(u.image!);
    console.log(`  ${u.image} -> key ${k} -> in bucket: ${k ? keys.has(k) : false}`);
  }

  console.log(`\nEMAIL_LOGO_URL -> ${process.env.EMAIL_LOGO_URL ?? "(unset)"}`);
  const logoKey = objectKeyFromUrl(process.env.EMAIL_LOGO_URL ?? "");
  console.log(`  key ${logoKey} in bucket: ${logoKey ? keys.has(logoKey) : false}`);
  console.log(`  branding/logo.png still in bucket: ${keys.has("branding/logo.png")}`);
  process.exit(0);
}
void main();
