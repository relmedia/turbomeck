import { db } from "@repo/database";
import { products, emailDesigns } from "@repo/database/schema";
import { objectKeyFromUrl } from "./media-uploads";

async function main() {
  const base = (process.env.PRODUCT_SERVICE_URL || "http://localhost:8000").replace(/\/$/, "");
  const secret = process.env.INTERNAL_PRODUCT_API_SECRET!;
  const res = await fetch(`${base}/api/media`, { headers: { Authorization: `Bearer ${secret}` } });
  const { objects } = (await res.json()) as { objects: Array<{ key: string; size: number }> };

  const [prods, designs] = await Promise.all([
    db.select({ id: products.id, name: products.name, image: products.image, thumbnails: products.thumbnails }).from(products),
    db.select({ id: emailDesigns.id, html: emailDesigns.html, design: emailDesigns.design }).from(emailDesigns),
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
  const designHtml = designs.map((d) => d.html ?? "").join("\n");
  const designJson = designs.map((d) => JSON.stringify(d.design ?? {})).join("\n");

  const unused = objects.filter((o) => !used.has(o.key) && !designHtml.includes(o.key));
  console.log(`objects: ${objects.length}, used by products: ${used.size}, reported unused: ${unused.length}\n`);

  for (const o of unused) {
    const inJson = designJson.includes(o.key);
    const bare = o.key.split("/").pop() ?? "";
    const stem = bare.replace(/\.[a-z0-9]+$/i, "");
    // Does ANY product reference the same stem under a different extension or path?
    const nearMiss = [...used].filter((u) => u.includes(stem.slice(0, Math.max(8, stem.length - 6))));
    console.log(
      `${o.key}  ${(o.size / 1024).toFixed(0)}kB` +
        (inJson ? "  [IN DESIGN JSON ONLY]" : "") +
        (nearMiss.length ? `  [near: ${nearMiss.slice(0, 2).join(", ")}]` : ""),
    );
  }
  process.exit(0);
}
void main();
