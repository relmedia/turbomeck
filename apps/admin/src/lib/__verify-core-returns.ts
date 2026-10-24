/**
 * Dry-runs the kärnretur sweep and shows which orders it considers open.
 *
 * Forces dry-run, so it never mails anyone and never writes a ledger row that
 * outlives the run.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@*\/node_modules/tsx/dist/cli.mjs \
 *     --tsconfig apps/admin/tsconfig.json --env-file=apps/admin/.env \
 *     apps/admin/src/lib/__verify-core-returns.ts
 */

process.env.SHIPPING_SYNC_DRY_RUN = "true";

import { db } from "@repo/database";
import { orders } from "@repo/database/schema";
import { and, eq, isNull } from "drizzle-orm";
import { syncCoreReturns } from "./sync-core-returns";

async function main() {
  const open = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      deadline: orders.coreReturnDeadline,
      received: orders.coreReceivedAt,
    })
    .from(orders)
    .where(and(eq(orders.commitsCoreReturnWithin14, true), isNull(orders.coreReceivedAt)));

  console.log(`Open core-return commitments: ${open.length}`);
  const now = Date.now();
  for (const o of open) {
    const days = o.deadline ? Math.round((o.deadline.getTime() - now) / 86_400_000) : null;
    console.log(
      `  #${o.id} ${o.orderNumber} status=${o.status} deadline=${o.deadline?.toISOString().slice(0, 10) ?? "—"}` +
        (days == null ? "" : ` (${days >= 0 ? `${days}d left` : `${-days}d overdue`})`),
    );
  }

  console.log("\nRunning sweep (dry run)…\n");
  const result = await syncCoreReturns();
  console.log("Result:", JSON.stringify(result, null, 2));
  process.exit(0);
}

void main();
