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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============ AUTH.JS ============
export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  password: text("password"), // hashed, for credentials provider
  role: text("role").default("customer").notNull(), // "admin" | "customer"
  metadata: jsonb("metadata").$type<{ savedAddress?: Record<string, string>; savedWishlist?: number[] }>(),
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
  shortDescription: text("short_description"),
  description: text("description"),
  /** English translations; when locale=en, used instead of name/shortDescription/description */
  nameEn: text("name_en"),
  shortDescriptionEn: text("short_description_en"),
  descriptionEn: text("description_en"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  stock: integer("stock").default(0).notNull(),
  weight: decimal("weight", { precision: 8, scale: 2 }), // kg, for PostNord shipping
  image: text("image"), // Main product image
  thumbnails: jsonb("thumbnails").$type<string[]>().default([]), // Additional gallery images
  /** Product variants e.g. [{ name: "Typ", options: ["13C","13T","14t"] }] - customer must choose when adding to cart */
  attributes: jsonb("attributes").$type<{ name: string; options: string[] }[]>().default([]),
  /** Homepage slider: 1 = show in slider, 0 = hide; sliderOrder = display order (lower first) */
  featuredInSlider: integer("featured_in_slider").default(0),
  sliderOrder: integer("slider_order"),
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
  deliveryOption: text("delivery_option").default("servicepoint"), // home | servicepoint
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  shippingCost: decimal("shipping_cost", { precision: 10, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 10, scale: 2 }).default("0").notNull(),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  status: text("status").default("confirmed").notNull(), // confirmed, deposit_paid, shipped, delivered, cancelled, completed
  /** Deposit flow: amount paid upfront (SEK); null for full-payment orders */
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }),
  /** Balance due after deposit; paid when customer sends old part and receives new turbo */
  balanceDue: decimal("balance_due", { precision: 12, scale: 2 }),
  /** Stripe payment ID for deposit */
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems, {
    relationName: "order_items",
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

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;

export type DiscountCode = typeof discountCodes.$inferSelect;
export type NewDiscountCode = typeof discountCodes.$inferInsert;

export type PageVisit = typeof pageVisits.$inferSelect;
export type NewPageVisit = typeof pageVisits.$inferInsert;
