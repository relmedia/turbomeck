/**
 * Idempotent: adds products.is_exchange_turbo if missing (for DBs that skipped migration 0014).
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
    ADD COLUMN IF NOT EXISTS "is_exchange_turbo" boolean DEFAULT false NOT NULL
  `;
  console.log("Column is_exchange_turbo is present on products.");
} finally {
  await sql.end();
}
