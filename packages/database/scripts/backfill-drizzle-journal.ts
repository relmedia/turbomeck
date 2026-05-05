/**
 * Backfill `drizzle.__drizzle_migrations` for a database that was bootstrapped
 * from a SQL backup (or via `drizzle-kit push`) and therefore has no journal
 * entries even though all migrations are already physically applied.
 *
 * Drizzle's migrator computes each migration's hash as
 *   sha256( sql_file_contents_with_statement_breakpoints_replaced_by_marker )
 * and stores it together with `created_at` (Date.now()).
 *
 * Run with:  pnpm --filter @repo/database tsx scripts/backfill-drizzle-journal.ts
 *
 * Idempotent: skips entries whose hash is already present.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

type Journal = { version: string; dialect: string; entries: JournalEntry[] };

const DRIZZLE_DIR = resolve(__dirname, "..", "drizzle");
const JOURNAL_PATH = resolve(DRIZZLE_DIR, "meta", "_journal.json");

function migrationHash(sql: string): string {
  // Matches drizzle-orm's readMigrationFiles():
  //   crypto.createHash("sha256").update(query).digest("hex")
  // where `query` is the full SQL file contents (no normalization).
  return createHash("sha256").update(sql).digest("hex");
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const journal: Journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8"));
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
    await sql`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT
      )
    `;

    const existing =
      await sql<{ hash: string }[]>`SELECT hash FROM drizzle.__drizzle_migrations`;
    const have = new Set(existing.map((r) => r.hash));

    let inserted = 0;
    for (const entry of journal.entries) {
      const fileSql = readFileSync(
        resolve(DRIZZLE_DIR, `${entry.tag}.sql`),
        "utf8",
      );
      const hash = migrationHash(fileSql);
      if (have.has(hash)) {
        console.log(`skip  ${entry.tag}  (already in journal)`);
        continue;
      }
      await sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${entry.when})
      `;
      inserted++;
      console.log(`add   ${entry.tag}`);
    }

    console.log(`\nBackfilled ${inserted} journal entries.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
