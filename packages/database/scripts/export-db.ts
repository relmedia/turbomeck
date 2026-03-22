/**
 * Export the database pointed to by DATABASE_URL (e.g. local Docker Postgres).
 * Requires `pg_dump` on PATH (PostgreSQL client tools).
 *
 * Usage:
 *   pnpm db:export
 *   pnpm db:export ./backups/my.dump
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "../src/loadRootEnv";

loadRootEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL in repo root .env");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultOut = resolve(__dirname, "../../../turbomeck.backup.dump");
const outArg = process.argv[2] ?? defaultOut;

const r = spawnSync("pg_dump", [url, "-Fc", "-f", outArg], {
  stdio: "inherit",
  shell: false,
});

if (r.status !== 0) {
  console.error(
    "\npg_dump failed. Check:\n" +
      "  • DATABASE_URL in repo root .env — user, password, host, port, database name\n" +
      "  • Local Postgres: password must match the role (often not the same as Docker)\n" +
      "  • Docker Postgres: use the mapped port (e.g. 5433) and the password from docker-compose\n" +
      "  • Test: psql \"%DATABASE_URL%\" -c \"SELECT 1\" (Windows) or psql \"$DATABASE_URL\" -c \"SELECT 1\"\n" +
      "  • pg_dump must be installed (PostgreSQL client tools)."
  );
  process.exit(r.status ?? 1);
}

console.log(`\nWrote ${outArg}`);
console.log("Copy this file to your VPS, then run: pnpm db:import /path/to/turbomeck.backup.dump");
