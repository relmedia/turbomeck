/**
 * Restore a pg_dump custom-format file into the database in DATABASE_URL (e.g. VPS Postgres).
 * Requires `pg_restore` on PATH.
 *
 * WARNING: Restores objects into the target DB. Use an empty DB or expect conflicts.
 * Typical VPS: create DB, set DATABASE_URL, run schema first OR use --clean restore.
 *
 * Usage:
 *   pnpm db:import ./turbomeck.backup.dump
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { loadRootEnv } from "../src/loadRootEnv";

loadRootEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL in repo root .env");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultDump = resolve(__dirname, "../../../turbomeck.backup.dump");
const dumpPath = process.argv[2] ?? defaultDump;

if (!existsSync(dumpPath)) {
  console.error(`File not found: ${dumpPath}`);
  process.exit(1);
}

console.log(`Restoring into DATABASE_URL (host from .env) from:\n  ${dumpPath}\n`);

const r = spawnSync(
  "pg_restore",
  [
    "-d",
    url,
    "--no-owner",
    "--no-acl",
    "--verbose",
    dumpPath,
  ],
  { stdio: "inherit", shell: false }
);

if (r.status !== 0) {
  console.error(
    "\npg_restore exited with errors. If the DB already has tables, use an empty database or drop it first."
  );
  process.exit(r.status ?? 1);
}

console.log("\nRestore finished.");
