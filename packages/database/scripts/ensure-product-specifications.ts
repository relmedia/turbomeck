/**
 * Idempotent: adds products.specifications if missing (for DBs that skipped migration 0016).
 */
import postgres from "postgres";
import { loadRootEnv } from "../src/loadRootEnv";

loadRootEnv();
const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5433/turbodb";

const sql = postgres(url, { max: 1 });
try {
  await sql`
    ALTER TABLE "products"
    ADD COLUMN IF NOT EXISTS "specifications" jsonb DEFAULT '[]'::jsonb
  `;
  console.log("Column specifications is present on products.");
} finally {
  await sql.end();
}
