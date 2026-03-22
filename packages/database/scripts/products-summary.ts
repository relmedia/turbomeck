/**
 * Print product row count and a small sample (uses DATABASE_URL from monorepo root .env).
 * Usage: pnpm --filter @repo/database db:products
 */
import postgres from "postgres";
import { loadRootEnv } from "../src/loadRootEnv";

loadRootEnv();

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/turbodb";

async function main() {
  console.log("Connection:", connectionString.replace(/:[^:@]+@/, ":****@"));
  const sql = postgres(connectionString, { max: 1 });

  try {
    const [{ c }] = await sql<{ c: number }>`
      SELECT count(*)::int AS c FROM products
    `;
    console.log("\nproducts table: total rows =", c);

    const [{ c: linkCount }] = await sql<{ c: number }>`
      SELECT count(*)::int AS c FROM product_categories
    `;
    console.log("product_categories links:", linkCount);

    const sample = await sql<
      { id: number; name: string; price: string; stock: number }[]
    >`
      SELECT id, name, price, stock
      FROM products
      ORDER BY id DESC
      LIMIT 10
    `;
    console.log("\nLatest 10 products (by id):\n");
    console.table(sample);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
