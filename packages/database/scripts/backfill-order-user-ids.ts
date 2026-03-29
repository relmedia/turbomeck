/**
 * One-off: set orders.user_id from matching "user".email when user_id IS NULL.
 *
 * Usage (from packages/database):
 *   pnpm db:backfill-order-users -- --dry-run   # preview only
 *   pnpm db:backfill-order-users                 # apply
 *
 * Uses DATABASE_URL (loads monorepo root .env via loadRootEnv).
 */
import postgres from "postgres";
import { loadRootEnv } from "../src/loadRootEnv";

loadRootEnv();

const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/turbodb";

const dryRun = process.argv.includes("--dry-run");

const sql = postgres(url, { max: 1 });

try {
  const preview = await sql<
    { id: number; order_number: string; email: string; matched_user_id: string }[]
  >`
    SELECT o.id, o.order_number, o.email, u.id AS matched_user_id
    FROM orders o
    INNER JOIN "user" u ON lower(trim(o.email)) = lower(trim(u.email))
    WHERE o.user_id IS NULL
    ORDER BY o.id
  `;

  console.log(
    `[backfill-order-user-ids] Orders with NULL user_id that match a user by email: ${preview.length}`,
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
    WHERE o.user_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "user" u
        WHERE lower(trim(u.email)) = lower(trim(o.email))
      )
    ORDER BY o.id
  `;

  if (stillOrphan.length > 0) {
    console.log(
      `\n[backfill-order-user-ids] Still NULL with no matching user (${stillOrphan.length}) — not updated:`,
    );
    console.table(stillOrphan);
  }

  if (dryRun) {
    console.log("\nDry run — no updates. Run without --dry-run to apply.");
    process.exit(0);
  }

  if (preview.length === 0) {
    console.log("Nothing to update.");
    process.exit(0);
  }

  const updated = await sql<
    { id: number; order_number: string; email: string; user_id: string }[]
  >`
    UPDATE orders AS o
    SET user_id = u.id
    FROM "user" AS u
    WHERE o.user_id IS NULL
      AND lower(trim(o.email)) = lower(trim(u.email))
    RETURNING o.id, o.order_number, o.email, o.user_id
  `;

  console.log(`\nUpdated ${updated.length} order row(s).`);
} finally {
  await sql.end({ timeout: 5 });
}
