/**
 * Seed the database with initial data.
 * Usage: pnpm db:seed  (from repo root) or pnpm --filter @repo/database db:seed
 *
 * Requires: DATABASE_URL env or postgresql://postgres:postgres@127.0.0.1:5433/turbodb
 * Run db:push or db:migrate first to ensure schema exists.
 */
import { db, categories } from "./index";
import { eq } from "drizzle-orm";

async function seed() {
  // Root category for product hierarchy (used in admin breadcrumbs)
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
