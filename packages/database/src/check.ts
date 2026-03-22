/**
 * Check database connectivity and verify all expected tables exist.
 * Usage: pnpm db:check
 *
 * Requires: DATABASE_URL env or postgresql://postgres:postgres@127.0.0.1:5433/turbodb
 */
import postgres from "postgres";
import { loadRootEnv } from "./loadRootEnv";

loadRootEnv();

const EXPECTED_TABLES = [
  "user",
  "account",
  "session",
  "verification_token",
  "password_reset_token",
  "products",
  "product_categories",
  "categories",
  "orders",
  "order_items",
  "reviews",
  "page_visits",
  "app_settings",
  "discount_codes",
];

async function check() {
  const connectionString =
    process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5433/turbodb";

  console.log("Checking database...");
  console.log("Connection:", connectionString.replace(/:[^:@]+@/, ":****@"));

  const sql = postgres(connectionString, { max: 1 });

  try {
    const result = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    const found = new Set(result.map((r) => r.table_name));
    const missing = EXPECTED_TABLES.filter((t) => !found.has(t));
    const extra = [...found].filter((t) => !EXPECTED_TABLES.includes(t));

    if (missing.length > 0) {
      console.error("\nMissing tables:", missing.join(", "));
      process.exit(1);
    }

    console.log("\nDatabase OK. Tables found:", found.size);
    console.log("Expected tables:", EXPECTED_TABLES.join(", "));
    if (extra.length > 0) {
      console.log("Extra tables:", extra.join(", "));
    }
  } finally {
    await sql.end();
  }
}

check()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Database check failed:", err.message);
    process.exit(1);
  });
