/**
 * Apply one SQL file using the app's own database connection.
 *
 * Why not `drizzle-kit migrate`: that applies every pending journal entry, and
 * this repo's journal has drifted from what the production database actually
 * has (`drizzle-kit generate` prompts about an unrelated
 * `products.specifications` change). When you need exactly one migration on,
 * this applies exactly that one — no psql client required, same DATABASE_URL
 * the services use.
 *
 * Statements are split on drizzle's `--> statement-breakpoint` marker and run
 * in order. Our migration files use IF NOT EXISTS / duplicate_object guards, so
 * re-running one is harmless.
 *
 * Usage:
 *   pnpm --filter @repo/database exec tsx scripts/apply-sql-file.ts drizzle/0017_checkout_intent.sql --dry-run
 *   pnpm --filter @repo/database exec tsx scripts/apply-sql-file.ts drizzle/0017_checkout_intent.sql
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "../src/loadRootEnv";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve DATABASE_URL BEFORE importing the db module, which fixes its
 * connection string at import time.
 *
 * `loadRootEnv()` is the repo's own loader and documents the convention: the
 * root .env is the single source for DATABASE_URL. The per-app fallback below
 * only runs when that file doesn't exist (servers here keep env per app), so
 * the convention still wins wherever it applies.
 */
function loadDatabaseUrl(): string {
  if (process.env.DATABASE_URL?.trim()) return "environment";

  loadRootEnv();
  if (process.env.DATABASE_URL?.trim()) return "repo-root .env (loadRootEnv)";

  const repoRoot = path.resolve(scriptDir, "../../..");
  const candidates = [
    "apps/product-service/.env",
    "apps/client/.env",
    "apps/admin/.env",
  ];

  for (const rel of candidates) {
    const file = path.join(repoRoot, rel);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, "utf8").split("\n");
    for (const rawLine of lines) {
      const line = rawLine.replace("\r", "").trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      if (line.slice(0, eq).trim() !== "DATABASE_URL") continue;
      let value = line.slice(eq + 1).trim();
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"));
      if (quoted) value = value.slice(1, -1);
      if (value) {
        process.env.DATABASE_URL = value;
        return rel;
      }
    }
  }

  return "not found (the db module will use its dev default)";
}

const envSource = loadDatabaseUrl();

const { db } = await import("../src/index");
const { sql } = await import("drizzle-orm");

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const target = args.find((a) => !a.startsWith("--"));

  if (!target) {
    console.error(
      "Usage: tsx scripts/apply-sql-file.ts <path/to/file.sql> [--dry-run]",
    );
    process.exit(1);
  }

  const file = path.resolve(process.cwd(), target);
  if (!fs.existsSync(file)) {
    console.error(`No such file: ${file}`);
    process.exit(1);
  }

  const statements = fs
    .readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((part) => part.trim())
    .filter(Boolean);

  console.log(`DATABASE_URL from : ${envSource}`);
  console.log(`File              : ${file}`);
  console.log(`Statements        : ${statements.length}`);
  console.log("");

  for (const [i, statement] of statements.entries()) {
    const firstLine = statement.split("\n")[0]?.slice(0, 100) ?? "";
    if (dryRun) {
      console.log(`[${i + 1}] would run: ${firstLine}`);
      continue;
    }
    await db.execute(sql.raw(statement));
    console.log(`[${i + 1}] ok: ${firstLine}`);
  }

  console.log(dryRun ? "\n--dry-run: nothing was executed." : "\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
