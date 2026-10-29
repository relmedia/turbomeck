import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  decimal,
  jsonb,
  foreignKey,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ============ AUTH.JS ============
export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  password: text("password"), // hashed, for credentials provider
  role: text("role").default("customer").notNull(), // "admin" | "customer"
  metadata: jsonb("metadata").$type<{
    savedAddress?: Record<string, string>;
    savedWishlist?: number[];
    /** ISO timestamp of the terms/privacy acceptance given at sign-up. */
    termsAcceptedAt?: string;
    /**
     * ISO timestamp of the one-time sweep that attached this user's pre-account
     * guest orders (matched on verified email). Set even when nothing matched,
     * so the sweep runs once rather than on every profile read.
     */
    ordersClaimedAt?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]
);

export const sessions = pgTable("session", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("verification_token", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const passwordResetTokens = pgTable("password_reset_token", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// ============ PRODUCTS ============
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /**
   * The product URL, stored rather than derived from the name.
   *
   * It used to be computed per read, so renaming a product changed its
   * address and the old one died. Backfilled with exactly the previous value
   * for every existing row, so no URL moved — it only stops future renames
   * from moving them.
   */
  slug: text("slug"),
  shortDescription: text("short_description"),
  description: text("description"),
  /** English translations; when locale=en, used instead of name/shortDescription/description */
  nameEn: text("name_en"),
  shortDescriptionEn: text("short_description_en"),
  descriptionEn: text("description_en"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  stock: integer("stock").default(0).notNull(),
  weight: decimal("weight", { precision: 8, scale: 2 }), // kg, for PostNord shipping
  /**
   * PostNord shipment class, mirroring their "Vad är det du skickar?" choice:
   * "light" (Lätt, max 3 kg) or "heavy" (Tung, max 15 kg). NULL on products
   * that predate the shipping section — the admin derives a sensible default
   * from `weight` when one is missing.
   *
   * A "pallet" class shipped briefly in migration 0020 and was dropped before
   * use; that migration's column COMMENT still mentions it. Nothing stores the
   * value, and the API rejects it.
   */
  shipmentType: text("shipment_type"),
  /**
   * Parcel dimensions in whole centimetres. Optional, exactly as in PostNord's
   * own form ("Mått (valfritt) — ange mått för en mer exakt prisuppskattning"):
   * a shipment prices on weight alone until dimensions are known.
   */
  lengthCm: integer("length_cm"),
  widthCm: integer("width_cm"),
  heightCm: integer("height_cm"),
  image: text("image"), // Main product image
  thumbnails: jsonb("thumbnails").$type<string[]>().default([]), // Additional gallery images
  /** Product variants e.g. [{ name: "Typ", options: ["13C","13T","14t"] }] - customer must choose when adding to cart */
  attributes: jsonb("attributes").$type<{ name: string; options: string[] }[]>().default([]),
  /**
   * Technical specifications shown in the "Specifikationer" tab on the product page,
   * e.g. [{ group: "Kompressor", label: "Kompressorhjul", value: "48,5 x 61 mm" }].
   * `group` is a free-text heading (Kompressor / Turbin / Anslutningar ...); rows
   * without one are listed under a generic heading.
   */
  specifications: jsonb("specifications")
    .$type<{ group?: string; label: string; value: string }[]>()
    .default([]),
  /** Homepage slider: 1 = show in slider, 0 = hide; sliderOrder = display order (lower first) */
  featuredInSlider: integer("featured_in_slider").default(0),
  sliderOrder: integer("slider_order"),
  /** Sweden kärnretur: product is sold as exchange turbo (core return rules apply in SE) */
  isExchangeTurbo: boolean("is_exchange_turbo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============ PRODUCT-CATEGORY (many-to-many) ============
export const productCategories = pgTable(
  "product_categories",
  {
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    categoryId: integer("category_id")
      .references(() => categories.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.categoryId] })]
);

export const productCategoriesRelations = relations(productCategories, ({ one }) => ({
  product: one(products, {
    fields: [productCategories.productId],
    references: [products.id],
    relationName: "product_productCategories",
  }),
  category: one(categories, {
    fields: [productCategories.categoryId],
    references: [categories.id],
    relationName: "category_productCategories",
  }),
}));

export const productsRelations = relations(products, ({ many }) => ({
  productCategories: many(productCategories, {
    relationName: "product_productCategories",
  }),
}));

// ============ CATEGORIES ============
export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    /** English translation for category name */
    nameEn: text("name_en"),
    description: text("description"),
    parentId: integer("parent_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    { unique: [t.name, t.parentId] },
    foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id],
      name: "categories_parent_id_fkey",
    }),
  ]
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "parent",
  }),
  children: many(categories, { relationName: "parent" }),
  productCategories: many(productCategories, {
    relationName: "category_productCategories",
  }),
}));

// ============ ORDERS ============
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(), // Human-readable, e.g. TM-2025-0001
  userId: text("user_id"), // Auth.js user ID when signed in
  /** Opaque secret for guest order links (detail, pay-balance). Required to read guest orders without userId. */
  viewToken: text("view_token"),
  email: text("email").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  address: text("address").notNull(),
  city: text("city").notNull(),
  postalCode: text("postal_code").notNull(),
  country: text("country").notNull().default("SE"),
  servicePointName: text("service_point_name"),
  servicePointId: text("service_point_id"),
  /**
   * The service point's own postal address, captured when the customer picks
   * it.
   *
   * PostNord rejects an EDI booking whose `deliveryParty` carries only a
   * `partyId` — "address is a required field" — and it cannot be looked up
   * afterwards: every by-id service point endpoint (v1 and v5
   * `findByServicePointId`, `servicepoints/{id}`) now answers `410 Gone`. So
   * the address has to be stored at the moment of choosing or it is lost.
   *
   * Nullable: orders created before this existed, and home deliveries, have no
   * service point at all.
   */
  servicePointStreet: text("service_point_street"),
  servicePointPostalCode: text("service_point_postal_code"),
  servicePointCity: text("service_point_city"),
  servicePointCountryCode: text("service_point_country_code"),
  deliveryOption: text("delivery_option").default("servicepoint"), // home | servicepoint
  /** ISO code actually charged. SEK is the base; NO deliveries are charged NOK
   *  so Klarna and other local methods are offered (they require the charge
   *  currency to match the buyer's country). */
  currency: text("currency").default("SEK").notNull(),
  /** SEK->currency rate used at checkout; NULL/1 for SEK. Stored so a sale can
   *  be reconciled against the rate that priced it. */
  fxRateFromSek: decimal("fx_rate_from_sek", { precision: 12, scale: 6 }),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  shippingCost: decimal("shipping_cost", { precision: 10, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 10, scale: 2 }).default("0").notNull(),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  /**
   * How this sale was treated for VAT: `domestic` | `eu_b2c` |
   * `export_zero_rated`.
   *
   * Stored because it is a fact about the sale, not something to re-derive.
   * Every VAT figure shown to a customer or to staff used to be recomputed as
   * `total * 0.2` — correct only for a 25%-inclusive Swedish price, and it
   * invented Swedish VAT on a Norwegian export that carries none. The
   * confirmation email for the one real Norwegian order printed
   * "Varav moms (25%)" in NOK.
   */
  vatTreatment: text("vat_treatment").default("domestic").notNull(),
  /** Rate actually charged: 0.25 domestic and EU B2C, 0 on a zero-rated export. */
  vatRate: decimal("vat_rate", { precision: 5, scale: 4 }).default("0.2500").notNull(),
  /** VAT contained in `total`, in `currency`. Zero on an export. */
  vatAmount: decimal("vat_amount", { precision: 12, scale: 2 }).default("0").notNull(),
  status: text("status").default("confirmed").notNull(), // confirmed, deposit_paid, shipped, delivered, cancelled, completed, partially_refunded, refunded
  /** Deposit flow: amount paid upfront (SEK); null for full-payment orders */
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }),
  /** Balance due after deposit; paid when customer sends old part and receives new turbo */
  balanceDue: decimal("balance_due", { precision: 12, scale: 2 }),
  /**
   * Stripe payment ID for deposit. Unique (see the table's `uniqueIndex`
   * below): one order per PaymentIntent. NULL for zero-total orders, and
   * Postgres treats NULLs as distinct, so any number of those coexist.
   */
  stripePaymentId: text("stripe_payment_id"),
  /** Stripe payment ID for balance (when customer pays remainder) */
  stripeBalancePaymentId: text("stripe_balance_payment_id"),
  /** Set when store receives customer's old turbo part */
  coreReceivedAt: timestamp("core_received_at", { mode: "date" }),
  /** Sweden: customer commits to return old turbo within 14 days (no upfront core fee). If false, core_keep_fee_sek charged at checkout. */
  commitsCoreReturnWithin14: boolean("commits_core_return_within_14"),
  /** SEK added to order total when customer declines core return (server-computed; do not trust client) */
  coreKeepFeeSek: integer("core_keep_fee_sek").default(0).notNull(),
  /** When commitsCoreReturnWithin14, deadline for receiving the old part */
  coreReturnDeadline: timestamp("core_return_deadline", { mode: "date" }),
  postNordTrackingId: text("post_nord_tracking_id"),
  /**
   * Merged EDI instruction + `idInformation` from PostNord Booking API 201 response.
   * Used to re-fetch the shipping label PDF via POST /rest/shipment/v3/edi/labels/pdf.
   */
  postNordLabelSnapshot: jsonb("post_nord_label_snapshot").$type<Record<string, unknown> | null>(),
  /**
   * The booked label itself, base64 PDF, stored at booking time.
   *
   * It is kept because re-requesting it is destructive: PostNord's
   * `/v3/edi/labels/pdf` is book-and-print, so every POST of the instruction
   * registers a NEW parcel (verified: two identical calls returned parcels
   * …512511 and …512528, neither being the one the order was booked as).
   * Booking now asks for the label once and keeps it here, and reprints read
   * this column instead of touching PostNord.
   */
  postNordLabelPdf: text("post_nord_label_pdf"),
  /** Paper size the stored PDF was rendered at, so the UI can say which it is. */
  postNordLabelPaperSize: text("post_nord_label_paper_size"),
  /**
   * Set when staff mark the booking cancelled.
   *
   * PostNord has no cancellation API — its delete endpoint is absent from the
   * Booking API spec, and `updateIndicator: "Deletion"` is ignored and books a
   * new shipment instead — so cancelling happens in PostNord's portal and this
   * records that it was done. The tracking id and label are deliberately kept:
   * they are the history of a parcel that existed and was paid for.
   */
  postNordBookingCancelledAt: timestamp("post_nord_booking_cancelled_at", { mode: "date" }),
  /**
   * The last status PostNord reported for this parcel, verbatim — one of the
   * `ItemDto.status` enum values (`EN_ROUTE`, `AVAILABLE_FOR_DELIVERY`,
   * `DELIVERED`, …).
   *
   * Stored unmapped on purpose. `orders.status` is our own coarse state and
   * cannot express "sitting at the service point waiting to be collected",
   * which is precisely the state the pickup reminders key off. Keeping
   * PostNord's own value means a mapping change never needs a backfill.
   */
  postNordStatus: text("post_nord_status"),
  /** When `postNordStatus` last CHANGED — not when it was last confirmed. */
  postNordStatusAt: timestamp("post_nord_status_at", { mode: "date" }),
  /** When the poller last asked PostNord about this parcel, changed or not. */
  postNordLastPolledAt: timestamp("post_nord_last_polled_at", { mode: "date" }),
  /** PostNord's own `item.deliveryDate`. The moment of delivery was previously recorded nowhere. */
  postNordDeliveredAt: timestamp("post_nord_delivered_at", { mode: "date" }),
  /**
   * When the parcel became collectable at the service point.
   *
   * This is the clock the pickup reminders run on, and PostNord's hold period
   * is short: it was cut from 7 days to 3 on 1 October 2026 (the recipient can
   * extend it back to 7 in PostNord's app). After that the parcel is returned
   * to us at our cost, which is the whole reason the reminders exist.
   */
  postNordAvailableAt: timestamp("post_nord_available_at", { mode: "date" }),
  /** PostNord's `estimatedTimeOfArrival`, when they offer one. */
  postNordEta: timestamp("post_nord_eta", { mode: "date" }),
  /**
   * Where the order came from: `storefront` for a real checkout, `admin` for
   * one staff created by hand.
   *
   * An admin order never passes through Stripe, so it has no PaymentIntent to
   * verify and no money behind it. Without this column it is indistinguishable
   * from a genuine zero-total order, and a test order would quietly count
   * towards revenue and show up as refundable. Defaults to `storefront` so
   * every existing row keeps its meaning.
   */
  createdVia: text("created_via").default("storefront").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  /**
   * One order per Stripe PaymentIntent.
   *
   * Two code paths create orders — the browser's POST /api/orders after
   * `confirmPayment` resolves, and the Stripe webhook's checkout-intent
   * finalize for a payment the browser never finished. Both used to guard with
   * a SELECT before inserting, which two concurrent writers both pass: the
   * webhook routinely arrives while the browser's POST is still waiting on its
   * own `paymentIntents.retrieve`, so one payment produced two orders, two
   * order numbers and two confirmation emails.
   *
   * This index is what actually prevents that. The application code uses it via
   * `ON CONFLICT (stripe_payment_id) DO NOTHING` and returns the existing order
   * instead of a second one.
   */
  uniqueIndex("orders_stripe_payment_id_unique").on(table.stripePaymentId),
]);

/**
 * Atomic source of order numbers, replacing `ORDER_NUMBER_START + count(*)`.
 *
 * `count(*)` was read in application code before the insert, so two concurrent
 * checkouts were issued the same number, and deleting an order made the next
 * one collide with a number already in use. Created and seeded in migration
 * 0019; read with `nextval` (see `nextOrderNumber` in product-service).
 */
export const ORDER_NUMBER_SEQUENCE = "orders_order_number_seq";

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  productId: integer("product_id").references(() => products.id),
  productName: text("product_name").notNull(),
  productImage: text("product_image"),
  /** Selected variant/attribute e.g. "Typ: 13C" */
  variant: text("variant"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull(),
});

/**
 * Server-side snapshot of a checkout, written when the Stripe PaymentIntent is
 * created and read back if the browser never manages to create the order.
 *
 * Why this exists: order creation used to happen only in the browser after the
 * Stripe redirect, from a `sessionStorage` snapshot. Anything that interrupted
 * that — a 3-D Secure detour that returns before the intent reaches
 * `succeeded`, a closed tab, a cross-origin redirect — left Stripe holding a
 * payment with no order behind it. With this row the webhook can finish the job.
 *
 * `quotedChargeSek` is the amount product-service itself quoted for this cart,
 * so finalizing can verify the payment against the figure the customer was
 * actually charged instead of a fresh re-price (prices and coupons can change
 * between payment and webhook, and that mismatch rejected real paid orders).
 */
export const checkoutIntents = pgTable("checkout_intent", {
  /** Stripe PaymentIntent id (pi_...), one checkout per intent. */
  paymentIntentId: text("payment_intent_id").primaryKey(),
  /** The order payload the storefront would have POSTed itself. */
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  /** SEK amount quoted (and charged) at intent-creation time. */
  quotedChargeSek: integer("quoted_charge_sek").notNull(),
  /** Set once an order has been created from this snapshot. */
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  consumedAt: timestamp("consumed_at", { mode: "date" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * One row per Stripe refund attempt against an order.
 *
 * A table rather than columns on `orders` because Stripe allows several partial
 * refunds against one charge, and because the row is what makes a double-submit
 * impossible: it is written as `pending` *before* Stripe is called, under a
 * unique idempotency key, so a retry finds the reservation instead of issuing a
 * second refund.
 *
 * Never the source of truth for what is still refundable — that is read live
 * from Stripe, since a refund issued from the Stripe dashboard never reaches us
 * (the webhook handles only payment_intent.*). These rows exist to reserve,
 * to audit, and to show history.
 */
/**
 * One row per (order, email kind): the record that an automated mail was sent,
 * and the lock that stops it being sent twice.
 *
 * The shipping poller runs every 30 minutes and re-reads the same orders each
 * time. Without this table a parcel sitting at `AVAILABLE_FOR_DELIVERY` for two
 * days would mail the customer ~96 times. No other customer email in this repo
 * has a sent-record at all — `orderRefunds.emailSentAt` is the closest thing
 * and it is only a record, nothing reads it to block a resend.
 *
 * The unique index IS the guarantee. Senders claim a row first with
 * `onConflictDoNothing` and only send if the insert won — the same
 * insert-and-inspect-rowcount pattern `persistOrder` uses for
 * `stripePaymentId`. `sentAt` stays NULL until the transport confirms, so a
 * crash mid-send leaves a claim that can be retried rather than a lie that
 * says the customer was told.
 */
/**
 * Visually-built email templates from the Unlayer editor.
 *
 * Its own table rather than another `app_settings` key: a design is a full
 * document (the JSON the editor round-trips plus the compiled HTML), tens of
 * kilobytes each, and several of them in one TEXT value would mean rewriting
 * every template to save one.
 *
 * Two representations are stored on purpose and they are not interchangeable.
 * `design` is the editor's own format — the only thing it can re-open for
 * editing. `html` is what actually gets emailed. Keeping both means a template
 * can be sent without booting the editor, and re-edited without re-parsing
 * HTML back into blocks, which Unlayer cannot do.
 *
 * `templateKey` optionally binds a design to one of the built-in email kinds
 * (`ready_for_pickup`, `order_delivered`, …). Null means a standalone template
 * that is only sent by hand.
 */
export const emailDesigns = pgTable("email_designs", {
  id: serial("id").primaryKey(),
  /** Shown in the admin list. */
  name: text("name").notNull(),
  /** `sv` | `en` — a design is per-language, like the copy it replaces. */
  locale: text("locale").default("sv").notNull(),
  /**
   * Which automated email this design replaces, if any. Null = standalone.
   * Not a foreign key: the kinds live in code, not in a table.
   */
  templateKey: text("template_key"),
  /** Subject line. Plain text — it becomes a mail header. */
  subject: text("subject").default("").notNull(),
  /** Unlayer's design document. The only format it can re-open. */
  design: jsonb("design").$type<Record<string, unknown> | null>(),
  /** The compiled HTML that is actually sent. */
  html: text("html").default("").notNull(),
  /**
   * Off by default. A newly built design must not start replacing a tested
   * transactional email the moment it is saved.
   */
  isActive: boolean("is_active").default(false).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  /**
   * At most ONE active design per (templateKey, locale). Without this, two
   * active designs for the same email is an ambiguity resolved by whichever
   * row the query happens to return first.
   */
  uniqueIndex("email_designs_active_per_key")
    .on(table.templateKey, table.locale)
    .where(sql`${table.isActive} = true AND ${table.templateKey} IS NOT NULL`),
]);

export const orderEmails = pgTable("order_emails", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  /**
   * Which mail: `shipment_dispatched`, `ready_for_pickup`,
   * `pickup_reminder_1`, `pickup_reminder_2`, `order_delivered`,
   * `core_return_reminder`, `core_return_overdue`.
   *
   * Free text rather than an enum so adding a mail does not need a migration;
   * the values are defined in `@repo/shipping`.
   */
  kind: text("kind").notNull(),
  /** When a sender took ownership of this (order, kind). */
  claimedAt: timestamp("claimed_at", { mode: "date" }).defaultNow().notNull(),
  /** Set only once the transport accepted the message. NULL = claimed, not yet sent. */
  sentAt: timestamp("sent_at", { mode: "date" }),
  /** Address it went to, kept so staff can see where a mail actually landed. */
  recipient: text("recipient"),
  /** Last failure, when the send did not succeed. */
  error: text("error"),
  /** Anything worth keeping for support: tracking id, service point, status at send time. */
  meta: jsonb("meta").$type<Record<string, unknown> | null>(),
}, (table) => [
  uniqueIndex("order_emails_order_kind_unique").on(table.orderId, table.kind),
]);

export const orderRefunds = pgTable("order_refunds", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  /**
   * The PaymentIntent this was taken against — `orders.stripePaymentId` or
   * `orders.stripeBalancePaymentId`. Stored rather than derived so the row
   * still says what it refunded if the order is later edited.
   */
  stripePaymentIntentId: text("stripe_payment_intent_id").notNull(),
  /** The Charge actually refunded (`pi.latest_charge` as of the quote). */
  stripeChargeId: text("stripe_charge_id"),
  /** Which slot of the order the PaymentIntent came from: full | deposit | balance. */
  chargeKind: text("charge_kind").notNull(),
  /**
   * NULL until Stripe answers. Postgres treats NULLs as distinct, so any number
   * of pending rows coexist under the unique index below — the same property
   * `orders_stripe_payment_id_unique` relies on.
   */
  stripeRefundId: text("stripe_refund_id"),
  /** Major units, decimal like `orders.total`. Drizzle returns these as STRINGS. */
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  /** The charge currency. Never assume SEK — orders can be NOK, DKK or EUR. */
  currency: text("currency").notNull(),
  /** pending | succeeded | failed */
  status: text("status").default("pending").notNull(),
  /** Internal note from the admin. Never shown to the customer. */
  note: text("note"),
  stripeFailureReason: text("stripe_failure_reason"),
  /** What makes the retry of a half-finished refund a no-op. */
  idempotencyKey: text("idempotency_key").notNull(),
  /**
   * `session.user.email ?? session.user.id`. Any admin may refund, so this plus
   * the server log is the entire audit trail — write it unconditionally.
   */
  performedBy: text("performed_by"),
  emailSentAt: timestamp("email_sent_at", { mode: "date" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("order_refunds_idempotency_key_unique").on(table.idempotencyKey),
  uniqueIndex("order_refunds_stripe_refund_id_unique").on(table.stripeRefundId),
  index("order_refunds_order_id_idx").on(table.orderId),
]);

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems, {
    relationName: "order_items",
  }),
  refunds: many(orderRefunds, {
    relationName: "order_refunds",
  }),
}));

export const orderRefundsRelations = relations(orderRefunds, ({ one }) => ({
  order: one(orders, {
    fields: [orderRefunds.orderId],
    references: [orders.id],
    relationName: "order_refunds",
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
    relationName: "order_items",
  }),
}));

// ============ REVIEWS ============
export const reviews = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    rating: integer("rating").notNull(),
    title: text("title"),
    comment: text("comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    editedAt: timestamp("edited_at"),
  },
  (t) => [{ unique: [t.productId, t.userId] }]
);

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, { fields: [reviews.productId], references: [products.id] }),
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
  order: one(orders, { fields: [reviews.orderId], references: [orders.id] }),
}));

// ============ PAGE VISITS (analytics - device and browser for dashboard charts) ============
export const pageVisits = pgTable("page_visits", {
  id: serial("id").primaryKey(),
  /** mobile | desktop | tablet */
  deviceType: text("device_type").notNull(),
  /** chrome | safari | firefox | edge | other */
  browser: text("browser"),
  path: text("path"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============ APP SETTINGS (key-value, e.g. mail config) ============
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ============ DISCOUNT CODES (RABATTKODER) ============
export const discountCodes = pgTable("discount_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  discountType: text("discount_type").notNull(), // "percent" | "fixed"
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  minOrderAmount: decimal("min_order_amount", { precision: 12, scale: 2 }),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0).notNull(),
  validFrom: timestamp("valid_from", { mode: "date" }),
  validUntil: timestamp("valid_until", { mode: "date" }),
  active: text("active").default("true").notNull(), // "true" | "false"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============ TYPE EXPORTS ============
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type CheckoutIntent = typeof checkoutIntents.$inferSelect;
export type NewCheckoutIntent = typeof checkoutIntents.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type OrderRefund = typeof orderRefunds.$inferSelect;
export type NewOrderRefund = typeof orderRefunds.$inferInsert;

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;

export type DiscountCode = typeof discountCodes.$inferSelect;
export type NewDiscountCode = typeof discountCodes.$inferInsert;

export type PageVisit = typeof pageVisits.$inferSelect;
export type NewPageVisit = typeof pageVisits.$inferInsert;

/**
 * Who uploaded an image, and when.
 *
 * R2 knows an object's key, size and last-modified date and nothing about the
 * person behind it; the upload endpoint is called with a service secret, so
 * the admin's identity is already gone by the time bytes arrive. This is
 * written by the admin proxy, which is the one hop that still has the
 * session.
 *
 * Images predating this table have no row, and the media library reports them
 * as unknown rather than inventing an owner.
 */
export const mediaUploads = pgTable("media_uploads", {
  id: serial("id").primaryKey(),
  /**
   * The R2 object key, without bucket or query string — the public URL can
   * carry a ?v= cache-buster and the host can change, so neither is stable.
   */
  objectKey: text("object_key").notNull(),
  uploadedById: text("uploaded_by_id"),
  /**
   * Denormalised deliberately: the library must still answer "who uploaded
   * this" after the account is gone.
   */
  uploadedByName: text("uploaded_by_name"),
  uploadedByEmail: text("uploaded_by_email"),
  originalName: text("original_name"),
  byteSize: integer("byte_size"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});
