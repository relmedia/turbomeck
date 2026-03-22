/**
 * Minimal seed: root category only (for admin breadcrumbs).
 * Your real catalog lives in PostgreSQL — copy it with `pnpm db:export` / `pnpm db:import`.
 *
 * Usage: pnpm db:seed  (from repo root)
 * Requires: DATABASE_URL, schema applied (pnpm db:push).
 */
import { db, categories } from "./index";
import { eq } from "drizzle-orm";

async function seed() {
  const existing = await db
    .select()
    .from(categories)
    .where(eq(categories.name, "Alla Produkter"))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(categories).values({
      name: "Alla Produkter",
      nameEn: "All Products",
      description: "Root category",
      parentId: null,
    });
    console.log("Seeded: categories (Alla Produkter)");
  } else {
    console.log("Seed skipped: Alla Produkter already exists");
  }

  console.log("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
