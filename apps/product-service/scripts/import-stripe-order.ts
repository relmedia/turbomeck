/**
 * Import a succeeded Stripe payment that has no order row.
 *
 * Why this exists: order creation used to happen only in the browser after the
 * Stripe redirect. A 3-D Secure detour that returned before the PaymentIntent
 * reached `succeeded`, a closed tab, or a cross-origin redirect left Stripe
 * holding money with nothing behind it (see `checkout_intent` and the webhook
 * finalize endpoint, which prevent this going forward). This script recovers
 * the payments that slipped through before that existed.
 *
 * It takes the richest source available, in order:
 *
 *   1. the `checkout_intent` snapshot, if one was stored  -> complete order
 *   2. the PaymentIntent's own metadata, if the storefront attached it
 *      -> customer + shipping + a line item summary
 *   3. Stripe's billing details and amount only
 *      -> order with one placeholder line item, to be corrected in admin
 *
 * Nothing is ever invented: in case 3 the line item says so explicitly.
 *
 * Usage (on the server, where STRIPE_SECRET_KEY is set):
 *
 *   pnpm --filter product-service exec tsx scripts/import-stripe-order.ts pi_xxx
 *   pnpm --filter product-service exec tsx scripts/import-stripe-order.ts pi_xxx --dry-run
 *   pnpm --filter product-service exec tsx scripts/import-stripe-order.ts pi_xxx --send-emails
 *   pnpm --filter product-service exec tsx scripts/import-stripe-order.ts --list-orphans
 *
 * Fields Stripe doesn't have can be supplied directly (each one is echoed in
 * the output as an override, so the record shows what came from where):
 *
 *   --email=  --name=  --phone=  --address=  --postal=  --city=  --country=
 *   --delivery=  --item=  --product-id=
 *
 * Emails are OFF by default: recovering a weeks-old payment should not surprise
 * the customer with a fresh "thanks for your order" unless you decide so.
 */
import "../src/load-local-env.js";
import Stripe from "stripe";
import { randomBytes } from "node:crypto";
import { db, orders, orderItems, checkoutIntents } from "@repo/database";
import { eq, sql } from "drizzle-orm";

const ORDER_NUMBER_START = 257;
const PLACEHOLDER_ITEM_SV =
  "Importerad betalning från Stripe – okänt innehåll, korrigera manuellt";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--") && !a.includes("=")));
const positional = args.filter((a) => !a.startsWith("--"));
const dryRun = flags.has("--dry-run");
const sendEmails = flags.has("--send-emails");
const listOrphans = flags.has("--list-orphans");

/**
 * `--key=value` overrides, for the fields Stripe may simply not have. A card
 * payment carries no shipping address unless the Payment Element collected one,
 * so for an older orphan you often have to supply what the customer told you by
 * other means. Overrides are recorded in the output, never silently applied.
 */
const overrides = new Map<string, string>(
  args
    .filter((a) => a.startsWith("--") && a.includes("="))
    .map((a) => {
      const eq = a.indexOf("=");
      return [a.slice(2, eq), a.slice(eq + 1)] as [string, string];
    }),
);

const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
if (!stripeKey || stripeKey.includes("placeholder")) {
  console.error("STRIPE_SECRET_KEY is not set for product-service — run this on the server.");
  process.exit(1);
}
const stripe = new Stripe(stripeKey);

function viewToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The `checkout_intent` table is newer than the payments this script exists to
 * recover, and may not be migrated yet. Treat "relation does not exist" as
 * simply having no snapshot rather than failing the whole import.
 */
async function readSnapshot(piId: string) {
  try {
    const [row] = await db
      .select()
      .from(checkoutIntents)
      .where(eq(checkoutIntents.paymentIntentId, piId))
      .limit(1);
    return row ?? null;
  } catch (err) {
    if (isMissingTableError(err)) {
      if (!warnedAboutMissingTable) {
        console.warn(
          "[import] checkout_intent table not found — continuing without snapshots. " +
            "Apply drizzle/0017_checkout_intent.sql to enable the webhook safety net.",
        );
        warnedAboutMissingTable = true;
      }
      return null;
    }
    throw err;
  }
}

let warnedAboutMissingTable = false;

function isMissingTableError(err: unknown): boolean {
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    if ((cur as { code?: string }).code === "42P01") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

async function nextOrderNumber(): Promise<string> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(orders);
  return `#${ORDER_NUMBER_START + (row?.count ?? 0)}`;
}

type Resolved = {
  source: "snapshot" | "metadata" | "stripe-only";
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  servicePointName: string | null;
  deliveryOption: string;
  items: Array<{ productId: number | null; productName: string; variant: string | null; price: number; quantity: number }>;
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  note: string[];
};

/**
 * Where the customer's name, email and address actually live on a payment.
 *
 * Modern Stripe API versions expose a single `latest_charge` (expanded by the
 * retrieve call above); the `charges` array only exists on older versions.
 * Check both, newest first — reading only `charges` is why the first run of
 * this script could not find an email.
 */
function billingDetailsOf(pi: Stripe.PaymentIntent): Stripe.Charge.BillingDetails | null {
  const latest = pi.latest_charge;
  if (latest && typeof latest === "object" && "billing_details" in latest) {
    return latest.billing_details ?? null;
  }
  const legacy = (pi as unknown as { charges?: { data?: Stripe.Charge[] } }).charges
    ?.data?.[0];
  return legacy?.billing_details ?? null;
}

function splitName(full: string | null | undefined): [string, string] {
  const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["", ""];
  if (parts.length === 1) return [parts[0]!, ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]!];
}

async function resolvePayload(pi: Stripe.PaymentIntent): Promise<Resolved> {
  const amountSek = Math.round(pi.amount / 100);
  const note: string[] = [];

  // 1. The authoritative snapshot.
  const intent = await readSnapshot(pi.id);
  if (intent) {
    const p = intent.payload as Record<string, unknown>;
    const items = Array.isArray(p.items) ? (p.items as Array<Record<string, unknown>>) : [];
    note.push("built from the checkout_intent snapshot");
    return {
      source: "snapshot",
      email: String(p.email ?? ""),
      firstName: String(p.firstName ?? ""),
      lastName: String(p.lastName ?? ""),
      phone: p.phone ? String(p.phone) : null,
      address: String(p.address ?? ""),
      city: String(p.city ?? ""),
      postalCode: String(p.postalCode ?? ""),
      country: String(p.country ?? "SE"),
      servicePointName: p.servicePointName ? String(p.servicePointName) : null,
      deliveryOption: String(p.deliveryOption ?? "servicepoint"),
      items: items.map((it) => ({
        productId: typeof it.productId === "number" ? it.productId : null,
        productName: String(it.productName ?? "?"),
        variant: it.variant ? String(it.variant) : null,
        price: Number(it.price ?? 0),
        quantity: Number(it.quantity ?? 1),
      })),
      subtotal: Number(p.subtotal ?? amountSek),
      shipping: Number(p.shippingCost ?? 0),
      discount: Number(p.discount ?? 0),
      total: amountSek,
      note,
    };
  }

  // 2. Metadata the storefront attached to the payment.
  const md = pi.metadata ?? {};
  const billing = billingDetailsOf(pi);
  const hasMetadata = Boolean(md.customer_email || md.ship_address);
  if (hasMetadata) {
    const [first, last] = splitName(md.customer_name);
    note.push("built from PaymentIntent metadata");
    if (md.items_truncated === "true") note.push("item list was truncated by Stripe's 500-char limit");
    note.push(`items as recorded: ${md.items ?? "(none)"}`);
    return {
      source: "metadata",
      email: String(md.customer_email ?? billing?.email ?? ""),
      firstName: first,
      lastName: last,
      phone: md.customer_phone ? String(md.customer_phone) : (billing?.phone ?? null),
      address: String(md.ship_address ?? billing?.address?.line1 ?? ""),
      city: String(md.ship_city ?? billing?.address?.city ?? ""),
      postalCode: String(md.ship_postal_code ?? billing?.address?.postal_code ?? ""),
      country: String(md.ship_country ?? billing?.address?.country ?? "SE"),
      servicePointName: md.ship_service_point ? String(md.ship_service_point) : null,
      deliveryOption: String(md.delivery_option ?? "servicepoint"),
      items: [
        {
          productId: null,
          productName: `${PLACEHOLDER_ITEM_SV} (${md.items ?? "?"})`.slice(0, 240),
          variant: null,
          price: amountSek,
          quantity: 1,
        },
      ],
      subtotal: Number(md.subtotal_sek ?? amountSek),
      shipping: Number(md.shipping_sek ?? 0),
      discount: Number(md.discount_sek ?? 0),
      total: amountSek,
      note,
    };
  }

  // 3. Stripe alone.
  const [first, last] = splitName(billing?.name ?? pi.shipping?.name);
  note.push("no snapshot and no metadata — built from Stripe billing details only");
  note.push("the line item is a placeholder; set the real products in admin");
  return {
    source: "stripe-only",
    email: String(pi.receipt_email ?? billing?.email ?? ""),
    firstName: first,
    lastName: last,
    phone: billing?.phone ?? null,
    address: String(billing?.address?.line1 ?? pi.shipping?.address?.line1 ?? ""),
    city: String(billing?.address?.city ?? pi.shipping?.address?.city ?? ""),
    postalCode: String(billing?.address?.postal_code ?? pi.shipping?.address?.postal_code ?? ""),
    country: String(billing?.address?.country ?? pi.shipping?.address?.country ?? "SE"),
    servicePointName: null,
    deliveryOption: "servicepoint",
    items: [
      {
        productId: null,
        productName: PLACEHOLDER_ITEM_SV,
        variant: null,
        price: amountSek,
        quantity: 1,
      },
    ],
    subtotal: amountSek,
    shipping: 0,
    discount: 0,
    total: amountSek,
    note,
  };
}

/** Apply `--key=value` arguments over whatever Stripe/the snapshot gave us. */
function applyOverrides(resolved: Resolved): void {
  const setIf = (key: string, apply: (value: string) => void) => {
    const value = overrides.get(key);
    if (value === undefined) return;
    apply(value);
    resolved.note.push(`override: ${key}="${value}"`);
  };

  setIf("email", (v) => (resolved.email = v));
  setIf("name", (v) => {
    const [first, last] = splitName(v);
    resolved.firstName = first;
    resolved.lastName = last;
  });
  setIf("phone", (v) => (resolved.phone = v));
  setIf("address", (v) => (resolved.address = v));
  setIf("postal", (v) => (resolved.postalCode = v));
  setIf("city", (v) => (resolved.city = v));
  setIf("country", (v) => (resolved.country = v.toUpperCase()));
  setIf("delivery", (v) => (resolved.deliveryOption = v));
  setIf("item", (v) => {
    const first = resolved.items[0];
    if (first) first.productName = v;
  });
  setIf("product-id", (v) => {
    const id = Number.parseInt(v, 10);
    const first = resolved.items[0];
    if (first && Number.isFinite(id)) first.productId = id;
  });
}

async function findOrphans(): Promise<void> {
  console.log("Scanning the last 100 succeeded PaymentIntents for ones with no order…\n");
  const list = await stripe.paymentIntents.list({ limit: 100 });
  let orphans = 0;
  for (const pi of list.data) {
    if (pi.status !== "succeeded") continue;
    const [existing] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.stripePaymentId, pi.id))
      .limit(1);
    if (existing) continue;
    orphans += 1;
    const snap = await readSnapshot(pi.id);
    console.log(
      `${pi.id}  ${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}  ` +
        `${new Date(pi.created * 1000).toISOString()}  ` +
        `${snap ? "snapshot available" : pi.metadata?.customer_email ? "metadata available" : "stripe-only"}`,
    );
  }
  console.log(`\n${orphans} succeeded payment(s) without an order.`);
}

async function main(): Promise<void> {
  if (listOrphans) {
    await findOrphans();
    process.exit(0);
  }

  const piId = positional[0];
  if (!piId?.startsWith("pi_")) {
    console.error("Usage: tsx scripts/import-stripe-order.ts pi_xxx [--dry-run] [--send-emails]");
    console.error("       tsx scripts/import-stripe-order.ts --list-orphans");
    process.exit(1);
  }

  const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
  if (pi.status !== "succeeded") {
    console.error(`PaymentIntent ${piId} is "${pi.status}", not "succeeded" — refusing to import.`);
    process.exit(1);
  }

  const [existing] = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber })
    .from(orders)
    .where(eq(orders.stripePaymentId, piId))
    .limit(1);
  if (existing) {
    console.log(`Already imported: order ${existing.id} (${existing.orderNumber}). Nothing to do.`);
    process.exit(0);
  }

  const resolved = await resolvePayload(pi);
  applyOverrides(resolved);
  const orderNumber = await nextOrderNumber();

  console.log(`PaymentIntent : ${piId}`);
  console.log(`Amount        : ${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}`);
  console.log(`Paid at       : ${new Date(pi.created * 1000).toISOString()}`);
  console.log(`Data source   : ${resolved.source}`);
  console.log(`Order number  : ${orderNumber}`);
  console.log(`Customer      : ${resolved.firstName} ${resolved.lastName} <${resolved.email}>`);
  console.log(
    `Ship to       : ${resolved.address}, ${resolved.postalCode} ${resolved.city}, ${resolved.country}`,
  );
  console.log(`Items         : ${resolved.items.map((i) => `${i.quantity}x ${i.productName} @${i.price}`).join(" | ")}`);
  for (const n of resolved.note) console.log(`Note          : ${n}`);

  if (!resolved.email) {
    console.error(
      "\nRefusing to import: no customer email could be determined.\n" +
        "Stripe has none for this payment (card payments carry no email unless\n" +
        "the Payment Element collected one). Supply it explicitly, e.g.:\n" +
        `  ... ${pi.id} --email=kund@example.com --name="Anna Svensson" \\\n` +
        '      --address="Drottninggatan 1" --postal=11151 --city=Stockholm',
    );
    process.exit(1);
  }

  if (dryRun) {
    console.log("\n--dry-run: nothing written.");
    process.exit(0);
  }

  const [order] = await db
    .insert(orders)
    .values({
      orderNumber,
      userId: null,
      viewToken: viewToken(),
      email: resolved.email,
      firstName: resolved.firstName || "—",
      lastName: resolved.lastName || "—",
      phone: resolved.phone,
      address: resolved.address || "—",
      city: resolved.city || "—",
      postalCode: resolved.postalCode || "—",
      country: resolved.country || "SE",
      servicePointName: resolved.servicePointName,
      servicePointId: null,
      deliveryOption: resolved.deliveryOption,
      subtotal: String(resolved.subtotal),
      shippingCost: String(resolved.shipping),
      discount: String(resolved.discount),
      total: String(resolved.total),
      depositAmount: null,
      balanceDue: null,
      stripePaymentId: piId,
      status: "confirmed",
    })
    .returning();

  if (!order) {
    console.error("Insert returned no row.");
    process.exit(1);
  }

  await db.insert(orderItems).values(
    resolved.items.map((it) => ({
      orderId: order.id,
      productId: it.productId ?? undefined,
      productName: it.productName,
      productImage: null,
      variant: it.variant,
      price: String(it.price),
      quantity: it.quantity,
    })),
  );

  // Link the snapshot, if there was one, so the webhook treats it as handled.
  try {
    await db
      .update(checkoutIntents)
      .set({ consumedAt: new Date(), orderId: order.id })
      .where(eq(checkoutIntents.paymentIntentId, piId));
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }

  console.log(`\nCreated order ${order.id} (${order.orderNumber}) for ${piId}.`);

  if (sendEmails) {
    const { sendOrderConfirmationEmail, sendAdminNewOrderEmail } = await import("../src/email.js");
    await Promise.allSettled([
      sendOrderConfirmationEmail({
        orderNumber: order.orderNumber,
        firstName: resolved.firstName,
        lastName: resolved.lastName,
        email: resolved.email,
        address: resolved.address,
        city: resolved.city,
        postalCode: resolved.postalCode,
        country: resolved.country,
        servicePointName: resolved.servicePointName,
        deliveryOption: resolved.deliveryOption,
        subtotal: resolved.subtotal,
        shippingCost: resolved.shipping,
        discount: resolved.discount,
        total: resolved.total,
        paymentMethodDisplay: "Betalt via Stripe",
        items: resolved.items.map((i) => ({
          productName: i.productName,
          productImage: null,
          variant: i.variant,
          price: i.price,
          quantity: i.quantity,
        })),
      }),
      sendAdminNewOrderEmail({
        orderNumber: order.orderNumber,
        orderId: order.id,
        firstName: resolved.firstName,
        lastName: resolved.lastName,
        email: resolved.email,
        phone: resolved.phone,
        address: resolved.address,
        city: resolved.city,
        postalCode: resolved.postalCode,
        country: resolved.country,
        servicePointName: resolved.servicePointName,
        deliveryOption: resolved.deliveryOption,
        subtotal: resolved.subtotal,
        shippingCost: resolved.shipping,
        discount: resolved.discount,
        total: resolved.total,
        paymentMethodDisplay: "Betalt via Stripe",
        items: resolved.items.map((i) => ({
          productName: i.productName,
          variant: i.variant,
          price: i.price,
          quantity: i.quantity,
        })),
      }),
    ]);
    console.log("Confirmation emails attempted (see log lines above for delivery).");
  } else {
    console.log("No emails sent (pass --send-emails if you want them).");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
