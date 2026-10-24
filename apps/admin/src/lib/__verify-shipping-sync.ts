/**
 * Runs one shipping-sync sweep and prints what it would do.
 *
 * Forces dry-run mode regardless of the environment, so this can never mail a
 * real customer or change an order. It reports the before/after of every
 * candidate so the selection fix is visible: the old job polled
 * `status = 'shipped'` only, while booking leaves an order at `confirmed` —
 * an order appearing here with status `confirmed` is one the previous
 * implementation could never have seen.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@*\/node_modules/tsx/dist/cli.mjs \
 *     --env-file=apps/admin/.env apps/admin/src/lib/__verify-shipping-sync.ts
 */

process.env.SHIPPING_SYNC_DRY_RUN = "true";

import { db } from "@repo/database";
import { orders } from "@repo/database/schema";
import { isNotNull } from "drizzle-orm";
import { syncShippingStatus } from "./sync-shipping-status";

async function snapshot() {
  return db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      tracking: orders.postNordTrackingId,
      pnStatus: orders.postNordStatus,
      lastPolled: orders.postNordLastPolledAt,
      availableAt: orders.postNordAvailableAt,
    })
    .from(orders)
    .where(isNotNull(orders.postNordTrackingId));
}

async function main() {
  const before = await snapshot();
  console.log(`Orders with a PostNord tracking id: ${before.length}`);
  for (const o of before) {
    console.log(
      `  #${o.id} ${o.orderNumber} status=${o.status} postnord=${o.pnStatus ?? "—"} tracking=${o.tracking}`,
    );
    if (o.status !== "shipped") {
      console.log(
        `      ^ the OLD poller selected status='shipped' only, so this order was invisible to it`,
      );
    }
  }

  console.log("\nRunning sweep (dry run — nothing is written, nothing is sent)…\n");
  const result = await syncShippingStatus();
  console.log("\nResult:", JSON.stringify(result, null, 2));

  const after = await snapshot();
  const changed = after.filter((a) => {
    const b = before.find((x) => x.id === a.id);
    return b && (b.status !== a.status || b.pnStatus !== a.pnStatus);
  });
  console.log(
    changed.length === 0
      ? "\nNo rows changed — correct for a dry run."
      : `\nWARNING: ${changed.length} row(s) changed during a dry run: ${JSON.stringify(changed)}`,
  );

  process.exit(0);
}

void main();
