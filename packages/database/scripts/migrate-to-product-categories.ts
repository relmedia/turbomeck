/**
 * One-time migration: Move products.category_id to product_categories (many-to-many).
 * Run this before db:push if you have existing products with category_id.
 *
 * pnpm tsx scripts/migrate-to-product-categories.ts
 */
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5433/turbodb";

async function migrate() {
  const client = postgres(connectionString);

  try {
    // Check if products still has category_id (old schema)
    const colCheck = await client`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'category_id'
    `;
    const hasCategoryId = colCheck.length > 0;

    if (!hasCategoryId) {
      console.log("products.category_id already removed – migration not needed.");
      return;
    }

    // Create product_categories if not exists
    await client`
      CREATE TABLE IF NOT EXISTS product_categories (
        product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        category_id integer NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY (product_id, category_id)
      )
    `;
    console.log("product_categories table ready.");

    // Copy existing category assignments
    const inserted = await client`
      INSERT INTO product_categories (product_id, category_id)
      SELECT id, category_id FROM products WHERE category_id IS NOT NULL
      ON CONFLICT (product_id, category_id) DO NOTHING
    `;
    console.log("Migrated existing product-category links.");

    // Drop old column
    await client`ALTER TABLE products DROP COLUMN IF EXISTS category_id`;
    console.log("Dropped products.category_id. Migration complete.");
  } finally {
    await client.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
