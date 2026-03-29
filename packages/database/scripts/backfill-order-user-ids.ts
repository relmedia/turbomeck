/**
 * One-off: set orders.user_id from matching "user".email when user_id is unset
 * (NULL or blank).
 *
 * Usage (from packages/database):
 *   pnpm db:backfill-order-users -- --dry-run   # preview only
 *   pnpm db:backfill-order-users                 # apply
 *
 * Uses DATABASE_URL (loads monorepo root .env via loadRootEnv).
 *
 * If you see "0 to update" unexpectedly, check the printed diagnostics:
 * - "Using fallback DATABASE_URL" means root .env was not loaded — export DATABASE_URL or create ../../.env
 * - missing_user_id = 0 → every order already has a user id
 * - missing_user_id > 0 but matchable = 0 → order emails don't match any "user".email (guest checkout, typo, etc.)
 */
import postgres from "postgres";
import { loadRootEnv } from "../src/loadRootEnv";

loadRootEnv();

const usingFallback = !process.env.DATABASE_URL?.trim();
const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/turbodb";

function describeDbUrl(raw: string): string {
  try {
    const u = new URL(
      raw.startsWith("postgres://") || raw.startsWith("postgresql://")
        ? raw.replace(/^postgres(ql)?:\/\//, "http://")
        : raw,
    );
    const db = (u.pathname || "/").replace(/^\//, "") || "(default)";
    const host = u.hostname || "?";
    const port = u.port ? `:${u.port}` : "";
    return `${host}${port}/${db}`;
  } catch {
    return "(unparseable URL)";
  }
}

const dryRun = process.argv.includes("--dry-run");

const sql = postgres(url, { max: 1 });

try {
  if (usingFallback) {
    console.warn(
      `[backfill-order-user-ids] WARNING: DATABASE_URL was not set; using dev default (${describeDbUrl(url)}).`,
    );
    console.warn(
      `  Set DATABASE_URL or ensure monorepo root .env exists (see loadRootEnv).`,
    );
  } else {
    console.log(
      `[backfill-order-user-ids] DATABASE_URL → ${describeDbUrl(url)}`,
    );
  }

  const [dbInfo] = await sql<{ db: string; user_count: string; order_count: string }[]>`
    SELECT
      current_database()::text AS db,
      (SELECT count(*)::text FROM "user") AS user_count,
      (SELECT count(*)::text FROM orders) AS order_count
  `;

  console.log(
    `[backfill-order-user-ids] Server database: "${dbInfo.db}" | users: ${dbInfo.user_count} | orders: ${dbInfo.order_count}`,
  );

  const [stats] = await sql<
    {
      missing_user_id: string;
      has_user_id: string;
      total: string;
    }[]
  >`
    SELECT
      count(*) FILTER (WHERE user_id IS NULL OR btrim(user_id) = '')::text AS missing_user_id,
      count(*) FILTER (WHERE user_id IS NOT NULL AND btrim(user_id) <> '')::text AS has_user_id,
      count(*)::text AS total
    FROM orders
  `;

  console.log(
    `[backfill-order-user-ids] orders: total=${stats.total}, missing user_id=${stats.missing_user_id}, already linked=${stats.has_user_id}`,
  );

  const preview = await sql<
    { id: number; order_number: string; email: string; matched_user_id: string }[]
  >`
    SELECT o.id, o.order_number, o.email, u.id AS matched_user_id
    FROM orders o
    INNER JOIN "user" u ON lower(trim(o.email)) = lower(trim(u.email))
    WHERE (o.user_id IS NULL OR btrim(o.user_id) = '')
    ORDER BY o.id
  `;

  console.log(
    `[backfill-order-user-ids] Match email → user (updatable): ${preview.length}`,
  );
  if (preview.length > 0) {
    console.table(
      preview.map((r) => ({
        id: r.id,
        order_number: r.order_number,
        email: r.email,
        matched_user_id: r.matched_user_id,
      })),
    );
  }

  const stillOrphan = await sql<{ id: number; order_number: string; email: string }[]>`
    SELECT o.id, o.order_number, o.email
    FROM orders o
    WHERE (o.user_id IS NULL OR btrim(o.user_id) = '')
      AND NOT EXISTS (
        SELECT 1
        FROM "user" u
        WHERE lower(trim(u.email)) = lower(trim(o.email))
      )
    ORDER BY o.id
  `;

  if (stillOrphan.length > 0) {
    console.log(
      `\n[backfill-order-user-ids] Still unlinked: no user with same email (${stillOrphan.length}) — not updated:`,
    );
    console.table(stillOrphan.slice(0, 50));
    if (stillOrphan.length > 50) {
      console.log(`  … and ${stillOrphan.length - 50} more (showing first 50).`);
    }
  }

  if (dryRun) {
    console.log("\nDry run — no updates. Run without --dry-run to apply.");
    process.exit(0);
  }

  if (preview.length === 0) {
    console.log(
      "\nNothing to update (no unlinked orders with a matching user email).",
    );
    process.exit(0);
  }

  const updated = await sql<
    { id: number; order_number: string; email: string; user_id: string }[]
  >`
    UPDATE orders AS o
    SET user_id = u.id
    FROM "user" AS u
    WHERE (o.user_id IS NULL OR btrim(o.user_id) = '')
      AND lower(trim(o.email)) = lower(trim(u.email))
    RETURNING o.id, o.order_number, o.email, o.user_id
  `;

  console.log(`\nUpdated ${updated.length} order row(s).`);
} finally {
  await sql.end({ timeout: 5 });
}
