import "./load-local-env.js";
import express, { type Request } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { db, products, categories, productCategories, orders, orderItems, reviews, users } from "@repo/database";
import { eq, inArray, desc, asc, sql, or } from "drizzle-orm";
import { processProductImage, removeBackgroundFromImageUrl } from "./image-utils.js";
import { isR2Configured, uploadToR2, deleteFromR2, listR2Products } from "./r2-storage.js";
import { sendOrderConfirmationEmail } from "./email.js";
import { internalProductApiAuth } from "./internal-auth-middleware.js";
import { resolveCheckoutOrder, type OrderItemInput } from "./order-pricing.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Set EXPOSE_DB_ERRORS=1 temporarily on the server to see Postgres messages in JSON (debug only). */
function generateOrderViewToken(): string {
  return randomBytes(32).toString("base64url");
}

function timingSafeTokenEqual(received: string, expected: string): boolean {
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * User-owned orders: matching `userId` (query/body) or matching `viewToken` (magic link).
 * Guest orders: matching `viewToken` only (legacy rows without token are inaccessible).
 */
function canReadOrderWithSecret(
  order: { userId: string | null; viewToken: string | null },
  queryUserId: string | undefined,
  secretToken: string | undefined,
): boolean {
  const tokenOk =
    !!secretToken &&
    !!order.viewToken &&
    timingSafeTokenEqual(secretToken, order.viewToken);

  if (order.userId) {
    if (queryUserId === order.userId) return true;
    return tokenOk;
  }
  return tokenOk;
}

function jsonDbError(err: unknown, publicMessage: string) {
  const code = (err as { code?: string })?.code;
  const msg = err instanceof Error ? err.message : String(err);
  if (process.env.EXPOSE_DB_ERRORS === "1") {
    return { error: publicMessage, detail: msg, code: code ?? undefined };
  }
  return { error: publicMessage };
}

function canAccessBalanceWithViewToken(
  order: { viewToken: string | null },
  token: string | undefined,
): boolean {
  if (!order.viewToken || !token) return false;
  return timingSafeTokenEqual(token, order.viewToken);
}

const stripeClient =
  process.env.STRIPE_SECRET_KEY?.trim() &&
  !process.env.STRIPE_SECRET_KEY.includes("placeholder")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

async function verifySucceededBalancePaymentIntent(
  paymentIntentId: string,
  expectedBalanceSek: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!stripeClient) {
    return { ok: false, error: "Stripe is not configured on product-service" };
  }
  try {
    const pi = await stripeClient.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== "succeeded") {
      return { ok: false, error: "Payment has not succeeded" };
    }
    if (String(pi.currency || "").toLowerCase() !== "sek") {
      return { ok: false, error: "Invalid currency" };
    }
    const expectedOre = Math.round(Number(expectedBalanceSek) * 100);
    if (pi.amount !== expectedOre) {
      return { ok: false, error: "Amount mismatch" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not verify payment with Stripe" };
  }
}

/** Checkout: charge must match server-computed SEK total (after pricing resolution). */
async function verifyCheckoutPaymentIntent(
  paymentIntentId: string,
  expectedChargeSek: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!paymentIntentId.startsWith("pi_")) {
    return { ok: false, error: "Invalid payment intent" };
  }
  if (!stripeClient) {
    return { ok: false, error: "Stripe is not configured on product-service" };
  }
  try {
    const pi = await stripeClient.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== "succeeded") {
      return { ok: false, error: "Payment has not succeeded" };
    }
    if (String(pi.currency || "").toLowerCase() !== "sek") {
      return { ok: false, error: "Invalid currency" };
    }
    const expectedOre = Math.round(expectedChargeSek * 100);
    if (pi.amount !== expectedOre) {
      return { ok: false, error: "Payment amount does not match order" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not verify payment with Stripe" };
  }
}

const app = express();

// Use temp dir for uploads – images go to R2 only, never to public folder
const UPLOAD_DIR = path.join(os.tmpdir(), "turbomeck-product-uploads");
const USE_R2 = isR2Configured();

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `product-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/avif",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only JPEG, PNG, GIF, WebP, and AVIF are allowed."
        )
      );
    }
  },
});

app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: ["http://localhost:3001", "http://localhost:3002", "http://localhost:3003"],
    credentials: true,
  })
);

/** Shared secret (Bearer) — required for all /api routes except GET /api/health/db (localhost-gated). */
app.use("/api", internalProductApiAuth);

/** Only loopback — safe to return Postgres error text (no password). */
function isLocalRequest(req: Request): boolean {
  const raw =
    req.socket.remoteAddress ??
    (typeof req.headers["x-forwarded-for"] === "string"
      ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
      : undefined);
  if (!raw) return false;
  const ip = raw.replace(/^::ffff:/, "");
  return ip === "127.0.0.1" || ip === "::1";
}

/** Localhost-only DB probe: `curl -sS http://127.0.0.1:8000/api/health/db` on the VPS. */
app.get("/api/health/db", async (req, res) => {
  if (!isLocalRequest(req)) {
    return res.status(404).json({ error: "Not found" });
  }
  try {
    await db.select({ id: categories.id }).from(categories).limit(1);
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as { code?: string }).code;
    res.status(500).json({ ok: false, message: msg, code });
  }
});

// Upload image endpoint – R2 only (no public folder)
app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!USE_R2) {
      try {
        fs.unlinkSync(path.join(UPLOAD_DIR, req.file.filename));
      } catch {
        /* ignore */
      }
      return res.status(503).json({
        error: "Image upload requires Cloudflare R2. Configure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL.",
      });
    }

    const inputPath = path.join(UPLOAD_DIR, req.file.filename);

    const result = await processProductImage(inputPath, true);
    if (!result.buffer) {
      return res.status(500).json({ error: "Failed to process image" });
    }
    const imageUrl = await uploadToR2(result.filename, result.buffer, "image/avif");
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    } catch {
      /* ignore */
    }
    res.json({
      success: true,
      url: imageUrl,
      filename: result.filename,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// List upload files (for attaching existing files to products) – R2 only
app.get("/api/upload", async (req, res) => {
  try {
    if (!USE_R2) {
      return res.json({ files: [] });
    }
    const files = await listR2Products();
    res.json({ files });
  } catch (error) {
    console.error("Error listing uploads:", error);
    res.status(500).json({ error: "Failed to list uploads" });
  }
});

// Delete image endpoint – R2 only
app.delete("/api/upload/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    if (!USE_R2) {
      return res.status(503).json({ error: "R2 not configured" });
    }
    await deleteFromR2(filename);
    res.json({ success: true, message: "File deleted successfully" });
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// Remove background from image – fetches from URL, processes, uploads to R2
app.post("/api/remove-background", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing or invalid url" });
    }
    if (!USE_R2) {
      return res.status(503).json({ error: "R2 not configured" });
    }
    const { filename, buffer } = await removeBackgroundFromImageUrl(url);
    const imageUrl = await uploadToR2(filename, buffer, "image/avif");
    // Add cache-bust so browser loads the updated image
    const separator = imageUrl.includes("?") ? "&" : "?";
    res.json({ url: `${imageUrl}${separator}v=${Date.now()}` });
  } catch (error) {
    console.error("Error removing background:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to remove background",
    });
  }
});

// GET all categories (with parentName for display; ?locale=en returns English names)
app.get("/api/categories", async (req, res) => {
  try {
    const locale = (req.query.locale as string) || "sv";
    const useEn = locale === "en";
    const all = await db.select().from(categories);
    const byId = Object.fromEntries(all.map((c) => [c.id, c]));
    const out = all.map((c) => {
      const cat = c as { name: string; nameEn?: string | null };
      const parent = c.parentId != null ? byId[c.parentId] : null;
      const parentCat = parent as { name: string; nameEn?: string | null } | undefined;
      const name = useEn && cat.nameEn ? cat.nameEn : cat.name;
      const parentName = parent
        ? (useEn && parentCat?.nameEn ? parentCat.nameEn : parent.name)
        : null;
      return {
        id: c.id,
        name,
        nameEn: cat.nameEn ?? null,
        description: c.description,
        parentId: c.parentId,
        parentName,
        createdAt: c.createdAt,
      };
    });
    res.json(out);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json(jsonDbError(error, "Failed to fetch categories"));
  }
});

// POST create category
app.post("/api/categories", async (req, res) => {
  try {
    const { name, description, parentId, nameEn } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Namn krävs" });
    }
    const inserted = await db
      .insert(categories)
      .values({
        name: name.trim(),
        nameEn: typeof nameEn === "string" ? nameEn.trim() || null : null,
        description: description?.trim() || null,
        parentId: parentId != null ? parseInt(parentId, 10) : null,
      })
      .returning();
    const c = inserted[0];
    const cat = c as { nameEn?: string | null };
    res.status(201).json({
      id: c.id,
      name: c.name,
      nameEn: cat.nameEn ?? null,
      description: c.description,
      parentId: c.parentId,
      createdAt: c.createdAt,
    });
  } catch (error) {
    console.error("Error creating category:", error);
    if ((error as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "En kategori med detta namn finns redan" });
    }
    res.status(500).json({ error: "Failed to create category" });
  }
});

// PUT update category
app.put("/api/categories/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, parentId, nameEn } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Namn krävs" });
    }
    const updateData: {
      name: string;
      nameEn?: string | null;
      description?: string | null;
      parentId?: number | null;
    } = {
      name: name.trim(),
      parentId: parentId != null ? parseInt(parentId, 10) : null,
    };
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (nameEn !== undefined) {
      updateData.nameEn = typeof nameEn === "string" && nameEn.trim() ? nameEn.trim() : null;
    }
    const updated = await db
      .update(categories)
      .set(updateData)
      .where(eq(categories.id, id))
      .returning();
    // Explicitly update name_en if Drizzle set() didn't persist it (e.g. schema sync issues)
    if (nameEn !== undefined) {
      const nameEnVal = typeof nameEn === "string" && nameEn.trim() ? nameEn.trim() : null;
      await db.execute(
        sql`UPDATE categories SET name_en = ${nameEnVal} WHERE id = ${id}`
      );
    }
    if (updated.length === 0) {
      return res.status(404).json({ error: "Kategorin hittades inte" });
    }
    const c = updated[0];
    const cat = c as { nameEn?: string | null };
    res.json({
      id: c.id,
      name: c.name,
      nameEn: cat.nameEn ?? null,
      description: c.description,
      parentId: c.parentId,
      createdAt: c.createdAt,
    });
  } catch (error) {
    console.error("Error updating category:", error);
    if ((error as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "En kategori med detta namn finns redan" });
    }
    res.status(500).json({ error: "Failed to update category" });
  }
});

// DELETE category (unlinks product-category links and child categories first)
app.delete("/api/categories/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(productCategories).where(eq(productCategories.categoryId, id));
    await db.update(categories).set({ parentId: null }).where(eq(categories.parentId, id));
    const deleted = await db.delete(categories).where(eq(categories.id, id)).returning();
    if (deleted.length === 0) {
      return res.status(404).json({ error: "Kategorin hittades inte" });
    }
    res.json({ message: "Kategorin har tagits bort", id });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ error: "Failed to delete category" });
  }
});

// GET reviews for a product
app.get("/api/reviews", async (req, res) => {
  try {
    const productId = req.query.productId;
    if (!productId || typeof productId !== "string") {
      return res.status(400).json({ error: "productId is required" });
    }
    const pid = parseInt(productId, 10);
    if (Number.isNaN(pid)) {
      return res.status(400).json({ error: "Invalid productId" });
    }
    const rows = await db
      .select({
        id: reviews.id,
        productId: reviews.productId,
        userId: reviews.userId,
        orderId: reviews.orderId,
        rating: reviews.rating,
        title: reviews.title,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
        userName: users.name,
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .where(eq(reviews.productId, pid))
      .orderBy(desc(reviews.createdAt));
    const out = rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      userId: r.userId,
      orderId: r.orderId,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      createdAt: r.createdAt,
      userName: r.userName ?? "Anonym",
      verifiedPurchase: r.orderId != null,
    }));
    const avgRating =
      out.length > 0
        ? out.reduce((s, r) => s + r.rating, 0) / out.length
        : 0;
    res.json({ reviews: out, averageRating: Math.round(avgRating * 10) / 10, totalCount: out.length });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// Helper: pick localized name/description based on locale (sv = default, en = use *_en if available)
function localizeProduct(
  p: { name: string; shortDescription: string | null; description: string | null; nameEn?: string | null; shortDescriptionEn?: string | null; descriptionEn?: string | null },
  locale: string
) {
  const useEn = locale === "en";
  const orDefault = (en: string | null | undefined, def: string | null) =>
    (useEn && en != null && String(en).trim() !== "" ? en : def) ?? def;
  return {
    name: orDefault(p.nameEn, p.name),
    shortDescription: orDefault(p.shortDescriptionEn, p.shortDescription),
    description: orDefault(p.descriptionEn, p.description),
  };
}

// Helper: get categoryIds for products
async function getProductCategoryIds(productIds: number[]): Promise<Map<number, number[]>> {
  if (productIds.length === 0) return new Map();
  const rows = await db
    .select({ productId: productCategories.productId, categoryId: productCategories.categoryId })
    .from(productCategories)
    .where(inArray(productCategories.productId, productIds));
  const map = new Map<number, number[]>();
  for (const r of rows) {
    const arr = map.get(r.productId) ?? [];
    arr.push(r.categoryId);
    map.set(r.productId, arr);
  }
  return map;
}

// GET all products (optional ?ids=1,2,3 for filtering, ?featuredInSlider=1 for homepage slider, ?locale=sv|en for translated content)
app.get("/api/products", async (req, res) => {
  try {
    const idsParam = req.query.ids as string | undefined;
    const featuredInSliderParam = req.query.featuredInSlider === "1" || req.query.featuredInSlider === "true";
    const locale = (req.query.locale as string) || "sv";
    const filterIds = idsParam
      ? idsParam.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
      : null;
    const productCols = {
      id: products.id,
      name: products.name,
      shortDescription: products.shortDescription,
      description: products.description,
      nameEn: products.nameEn,
      shortDescriptionEn: products.shortDescriptionEn,
      descriptionEn: products.descriptionEn,
      price: products.price,
      image: products.image,
      thumbnails: products.thumbnails,
      stock: products.stock,
      weight: products.weight,
      attributes: products.attributes,
      featuredInSlider: products.featuredInSlider,
      sliderOrder: products.sliderOrder,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    };
    let allProducts;
    if (featuredInSliderParam) {
      allProducts = await db
        .select(productCols)
        .from(products)
        .where(eq(products.featuredInSlider, 1))
        .orderBy(asc(products.sliderOrder), asc(products.id));
    } else if (filterIds?.length) {
      allProducts = await db.select(productCols).from(products).where(inArray(products.id, filterIds));
    } else {
      allProducts = await db.select(productCols).from(products);
    }
    const productIds = allProducts.map((p) => p.id);
    const categoryMap = await getProductCategoryIds(productIds);

    // Average rating per product (products without reviews get null)
    const ratingMap = new Map<number, { avg: number; count: number }>();
    if (productIds.length > 0) {
      try {
        const ratingRows = await db
          .select({
            productId: reviews.productId,
            avgRating: sql<number>`round(avg(${reviews.rating})::numeric, 1)`,
            count: sql<number>`count(*)::int`,
          })
          .from(reviews)
          .where(inArray(reviews.productId, productIds))
          .groupBy(reviews.productId);
        for (const r of ratingRows) {
          ratingMap.set(r.productId, { avg: Number(r.avgRating), count: r.count });
        }
      } catch (ratingErr) {
        console.error("Error fetching review aggregates (continuing without ratings):", ratingErr);
      }
    }

    const formatted = allProducts.map((p) => {
      const loc = localizeProduct(p, locale);
      return {
      id: p.id,
      slug: productNameToSlug(p.name),
      name: loc.name,
      shortDescription: loc.shortDescription,
      description: loc.description,
      price: parseFloat(p.price),
      image: p.image,
      thumbnails: (p as { thumbnails?: string[] }).thumbnails ?? [],
      stock: p.stock,
      weight: p.weight != null ? parseFloat(p.weight) : null,
      categoryIds: categoryMap.get(p.id) ?? [],
      attributes: (p as { attributes?: { name: string; options: string[] }[] }).attributes ?? [],
      featuredInSlider: (p as { featuredInSlider?: number | null }).featuredInSlider ?? 0,
      sliderOrder: (p as { sliderOrder?: number | null }).sliderOrder ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      averageRating: ratingMap.get(p.id)?.avg ?? null,
      reviewCount: ratingMap.get(p.id)?.count ?? 0,
    };
    });
    res.json(formatted);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json(jsonDbError(error, "Failed to fetch products"));
  }
});

// Slug helper for product lookup
function productNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "product";
}

// GET product by slug (?locale=sv|en for translated content)
app.get("/api/products/slug/:slug", async (req, res) => {
  try {
    const slug = req.params.slug;
    const locale = (req.query.locale as string) || "sv";
    const allProducts = await db
      .select({
        id: products.id,
        name: products.name,
        shortDescription: products.shortDescription,
        description: products.description,
        nameEn: products.nameEn,
        shortDescriptionEn: products.shortDescriptionEn,
        descriptionEn: products.descriptionEn,
        price: products.price,
        image: products.image,
        thumbnails: products.thumbnails,
        stock: products.stock,
        weight: products.weight,
        attributes: products.attributes,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products);
    const product = allProducts.find((p) => {
      if (productNameToSlug(p.name) === slug) return true;
      const nameEn = (p as { nameEn?: string | null }).nameEn;
      return nameEn ? productNameToSlug(nameEn) === slug : false;
    });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    const p = product;
    const loc = localizeProduct(p, locale);
    const categoryIds = (await getProductCategoryIds([p.id])).get(p.id) ?? [];
    res.json({
      id: p.id,
      slug: productNameToSlug(p.name),
      name: loc.name,
      shortDescription: loc.shortDescription,
      description: loc.description,
      price: parseFloat(p.price),
      image: p.image,
      thumbnails: (p as { thumbnails?: string[] }).thumbnails ?? [],
      stock: p.stock,
      weight: p.weight != null ? parseFloat(p.weight) : null,
      categoryIds,
      attributes: (p as { attributes?: { name: string; options: string[] }[] }).attributes ?? [],
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
  } catch (error) {
    console.error("Error fetching product by slug:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// GET single product by id (?locale=sv|en for translated content)
app.get("/api/products/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const locale = (req.query.locale as string) || "sv";
    const product = await db
      .select({
        id: products.id,
        name: products.name,
        shortDescription: products.shortDescription,
        description: products.description,
        nameEn: products.nameEn,
        shortDescriptionEn: products.shortDescriptionEn,
        descriptionEn: products.descriptionEn,
        price: products.price,
        image: products.image,
        thumbnails: products.thumbnails,
        stock: products.stock,
        weight: products.weight,
        attributes: products.attributes,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .where(eq(products.id, id));
    if (product.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    const p = product[0];
    const loc = localizeProduct(p, locale);
    const categoryIds = (await getProductCategoryIds([p.id])).get(p.id) ?? [];
    const orderCountResult = await db
      .select({ count: sql<number>`count(distinct ${orderItems.orderId})::int` })
      .from(orderItems)
      .where(eq(orderItems.productId, id));
    const orderCount = orderCountResult[0]?.count ?? 0;
    const totalRevenueResult = await db
      .select({ total: sql<string>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)::text` })
      .from(orderItems)
      .where(eq(orderItems.productId, id));
    const totalRevenue = parseFloat(totalRevenueResult[0]?.total ?? "0");
    res.json({
      id: p.id,
      slug: productNameToSlug(p.name),
      name: loc.name,
      shortDescription: loc.shortDescription,
      description: loc.description,
      nameEn: (p as { nameEn?: string | null }).nameEn ?? null,
      shortDescriptionEn: (p as { shortDescriptionEn?: string | null }).shortDescriptionEn ?? null,
      descriptionEn: (p as { descriptionEn?: string | null }).descriptionEn ?? null,
      price: parseFloat(p.price),
      image: p.image,
      thumbnails: (p as { thumbnails?: string[] }).thumbnails ?? [],
      stock: p.stock,
      weight: p.weight != null ? parseFloat(p.weight) : null,
      categoryIds,
      attributes: (p as { attributes?: { name: string; options: string[] }[] }).attributes ?? [],
      orderCount,
      totalRevenue,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// POST create product
app.post("/api/products", async (req, res) => {
  try {
    const { name, shortDescription, description, price, image, thumbnails, stock, weight, categoryIds, nameEn, shortDescriptionEn, descriptionEn } = req.body;

    const catIds = Array.isArray(categoryIds)
      ? categoryIds.filter((x: unknown) => typeof x === "number" || (typeof x === "string" && !isNaN(Number(x)))).map((x: unknown) => parseInt(String(x), 10))
      : [];

    const newProduct = {
      name,
      shortDescription,
      description,
      price: price.toString(),
      image: image || null,
      thumbnails: thumbnails && Array.isArray(thumbnails) ? thumbnails : [],
      stock: stock || 0,
      weight: weight != null ? weight.toString() : null,
      nameEn: nameEn != null && String(nameEn).trim() !== "" ? String(nameEn) : null,
      shortDescriptionEn: shortDescriptionEn != null && String(shortDescriptionEn).trim() !== "" ? String(shortDescriptionEn) : null,
      descriptionEn: descriptionEn != null && String(descriptionEn).trim() !== "" ? String(descriptionEn) : null,
    };

    const inserted = await db.insert(products).values(newProduct).returning();
    const p = inserted[0];

    if (catIds.length > 0) {
      await db.insert(productCategories).values(
        catIds.map((categoryId: number) => ({ productId: p.id, categoryId }))
      );
    }

    const categoryIdsRes = (await getProductCategoryIds([p.id])).get(p.id) ?? [];

    res.status(201).json({
      id: p.id,
      name: p.name,
      shortDescription: p.shortDescription,
      description: p.description,
      price: parseFloat(p.price),
      image: p.image,
      thumbnails: (p as { thumbnails?: string[] }).thumbnails ?? [],
      stock: p.stock,
      weight: p.weight != null ? parseFloat(p.weight) : null,
      categoryIds: categoryIdsRes,
      attributes: (p as { attributes?: { name: string; options: string[] }[] }).attributes ?? [],
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ error: "Failed to create product" });
  }
});

// PUT update product
app.put("/api/products/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, shortDescription, description, price, image, thumbnails, stock, weight, categoryIds, attributes, nameEn, shortDescriptionEn, descriptionEn, featuredInSlider, sliderOrder } = req.body;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = String(name ?? "");
    if (shortDescription !== undefined) updateData.shortDescription = shortDescription != null ? String(shortDescription) : null;
    if (description !== undefined) updateData.description = description != null ? String(description) : null;
    if (nameEn !== undefined) updateData.nameEn = nameEn != null && String(nameEn).trim() !== "" ? String(nameEn) : null;
    if (shortDescriptionEn !== undefined) updateData.shortDescriptionEn = shortDescriptionEn != null && String(shortDescriptionEn).trim() !== "" ? String(shortDescriptionEn) : null;
    if (descriptionEn !== undefined) updateData.descriptionEn = descriptionEn != null && String(descriptionEn).trim() !== "" ? String(descriptionEn) : null;
    if (price !== undefined) updateData.price = String(Number(price) || 0);
    if (image !== undefined) updateData.image = image != null && image !== "" ? String(image) : null;
    if (thumbnails !== undefined) {
      const arr = Array.isArray(thumbnails) ? thumbnails : [];
      updateData.thumbnails = arr.filter((t): t is string => typeof t === "string");
    }
    if (stock !== undefined) updateData.stock = Math.max(0, Math.floor(Number(stock) || 0));
    if (weight !== undefined) {
      const w = weight != null && String(weight).trim() !== "" ? Number(weight) : NaN;
      updateData.weight = !Number.isNaN(w) ? String(w) : null;
    }
    if (attributes !== undefined) {
      updateData.attributes = Array.isArray(attributes)
        ? attributes.filter((a: unknown) => a && typeof a === "object" && "name" in a && "options" in a && Array.isArray((a as { options: unknown }).options))
        : [];
    }
    if (featuredInSlider !== undefined) {
      updateData.featuredInSlider = featuredInSlider === true || featuredInSlider === 1 || featuredInSlider === "1" ? 1 : 0;
    }
    if (sliderOrder !== undefined) {
      const so = sliderOrder != null && String(sliderOrder).trim() !== "" ? Number(sliderOrder) : NaN;
      updateData.sliderOrder = !Number.isNaN(so) && so >= 0 ? so : null;
    }

    const updated = await db.update(products).set(updateData).where(eq(products.id, id)).returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (categoryIds !== undefined) {
      await db.delete(productCategories).where(eq(productCategories.productId, id));
      const catIds = Array.isArray(categoryIds)
        ? categoryIds
            .filter((x: unknown) => typeof x === "number" || (typeof x === "string" && !isNaN(Number(x))))
            .map((x: unknown) => parseInt(String(x), 10))
        : [];
      if (catIds.length > 0) {
        await db.insert(productCategories).values(
          catIds.map((categoryId: number) => ({ productId: id, categoryId }))
        );
      }
    }

    const p = updated[0];
    const categoryIdsRes = (await getProductCategoryIds([p.id])).get(p.id) ?? [];

    res.json({
      id: p.id,
      name: p.name,
      shortDescription: p.shortDescription,
      description: p.description,
      price: parseFloat(p.price),
      image: p.image,
      thumbnails: (p as { thumbnails?: string[] }).thumbnails ?? [],
      stock: p.stock,
      weight: p.weight != null ? parseFloat(p.weight) : null,
      categoryIds: categoryIdsRes,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    const err = error as Error & { code?: string; constraint?: string };
    const msg = err.code ? `${err.message} (${err.code})` : err.message || "Failed to update product";
    res.status(500).json({ error: msg });
  }
});

// ============ ORDERS ============

const ORDER_NUMBER_START = 257;

async function generateOrderNumber(): Promise<string> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders);
  const num = ORDER_NUMBER_START + (result[0]?.count ?? 0);
  return `#${num}`;
}

/** Server-side checkout quote — amount matches POST /api/orders; never trust client-displayed totals. */
app.post("/api/checkout-quote", async (req, res) => {
  try {
    const body = req.body as {
      items?: unknown;
      couponCode?: string;
      country?: string;
      deliveryOption?: string;
      commitsCoreReturnWithin14?: boolean;
    };
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ error: "items required" });
    }
    const priced = await resolveCheckoutOrder({
      items: body.items as OrderItemInput[],
      couponCode: body.couponCode,
      country: body.country,
      deliveryOption: body.deliveryOption,
      commitsCoreReturnWithin14: body.commitsCoreReturnWithin14,
    });
    if (!priced.ok) {
      return res.status(priced.status).json({ error: priced.error });
    }
    res.json({
      amount: priced.stripeChargeSek,
      subtotal: priced.subtotal,
      discount: priced.discount,
      shipping: priced.shipping,
      coreKeepFeeSek: priced.coreKeepFeeSek,
      total: priced.total,
    });
  } catch (error) {
    console.error("checkout-quote:", error);
    res.status(500).json({ error: "Failed to quote checkout" });
  }
});

// POST create order (checkout) — line prices and totals computed from DB + Stripe verification
app.post("/api/orders", async (req, res) => {
  try {
    const body = req.body as {
      userId?: string;
      email: string;
      firstName: string;
      lastName: string;
      phone?: string;
      address: string;
      city: string;
      postalCode: string;
      country?: string;
      servicePointName?: string;
      servicePointId?: string;
      deliveryOption?: string;
      couponCode?: string;
      stripePaymentId?: string;
      postNordTrackingId?: string;
      locale?: "sv" | "en";
      commitsCoreReturnWithin14?: boolean;
      items: Array<{
        productId?: number;
        productName: string;
        productImage?: string;
        variant?: string;
        price: number;
        quantity: number;
      }>;
    };

    if (!body.email || !body.firstName || !body.lastName || !body.address || !body.city || !body.postalCode) {
      return res.status(400).json({ error: "Missing required shipping fields" });
    }

    const priced = await resolveCheckoutOrder({
      items: body.items,
      couponCode: body.couponCode,
      country: body.country,
      deliveryOption: body.deliveryOption,
      commitsCoreReturnWithin14: body.commitsCoreReturnWithin14,
    });
    if (!priced.ok) {
      return res.status(priced.status).json({ error: priced.error });
    }

    const stripePaymentId = body.stripePaymentId?.trim() ?? "";
    let payVerify: { ok: true } | { ok: false; error: string } = { ok: true };
    if (priced.stripeChargeSek > 0) {
      payVerify = await verifyCheckoutPaymentIntent(stripePaymentId, priced.stripeChargeSek);
    } else if (stripePaymentId) {
      payVerify = { ok: false, error: "Payment not expected for zero-total order" };
    }
    if (!payVerify.ok) {
      return res.status(400).json({ error: payVerify.error });
    }

    const orderNumber = await generateOrderNumber();

    const hasTrackingId = !!(
      body.postNordTrackingId &&
      String(body.postNordTrackingId).trim() &&
      String(body.postNordTrackingId).toLowerCase() !== "null"
    );
    const initialStatus = hasTrackingId ? "shipped" : "confirmed";

    const coreDeadline =
      priced.commitsCoreReturnWithin14 === true
        ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        : null;

    const viewToken = generateOrderViewToken();
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber,
        userId: body.userId ?? null,
        viewToken,
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone ?? null,
        address: body.address,
        city: body.city,
        postalCode: body.postalCode,
        country: body.country ?? "SE",
        servicePointName: body.servicePointName ?? null,
        servicePointId: body.servicePointId ?? null,
        deliveryOption: body.deliveryOption ?? "servicepoint",
        subtotal: String(priced.subtotal),
        shippingCost: String(priced.shipping),
        discount: String(priced.discount),
        total: String(priced.total),
        depositAmount: null,
        balanceDue: null,
        commitsCoreReturnWithin14: priced.commitsCoreReturnWithin14,
        coreKeepFeeSek: priced.coreKeepFeeSek,
        coreReturnDeadline: coreDeadline,
        stripePaymentId: stripePaymentId || null,
        postNordTrackingId: body.postNordTrackingId ?? null,
        status: initialStatus,
      })
      .returning();

    await db.insert(orderItems).values(
      priced.lines.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        productName: item.productName,
        productImage: item.productImage ?? null,
        variant: item.variant ?? null,
        price: String(item.unitPrice),
        quantity: item.quantity,
      })),
    );

    const emailItems = priced.lines.map((item) => ({
      productName: item.productName,
      productImage: item.productImage,
      variant: item.variant,
      price: item.unitPrice,
      quantity: item.quantity,
    }));

    sendOrderConfirmationEmail({
      orderNumber: order.orderNumber,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      address: body.address,
      city: body.city,
      postalCode: body.postalCode,
      country: body.country ?? "SE",
      servicePointName: body.servicePointName,
      deliveryOption: body.deliveryOption,
      subtotal: priced.subtotal,
      shippingCost: priced.shipping,
      discount: priced.discount,
      total: priced.total,
      trackingId: body.postNordTrackingId,
      locale: body.locale,
      items: emailItems,
    }).catch((err) => console.error("[order] Failed to send confirmation email:", err));

    res.status(201).json({
      id: order.id,
      orderNumber: order.orderNumber,
      postNordTrackingId: order.postNordTrackingId,
      viewToken: order.viewToken,
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// GET orders for user (userId only — email is not proof of ownership)
app.get("/api/orders", async (req, res) => {
  try {
    const { userId, email } = req.query as { userId?: string; email?: string };

    if (email !== undefined && String(email).trim() !== "") {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!userId || typeof userId !== "string" || !userId.trim()) {
      return res.status(400).json({ error: "Provide userId" });
    }

    const conditions = eq(orders.userId, userId.trim());

    const userOrders = await db
      .select()
      .from(orders)
      .where(conditions)
      .orderBy(desc(orders.createdAt));

    const ordersWithItems = await Promise.all(
      userOrders.map(async (o) => {
        const items = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, o.id));
        return {
          id: o.id,
          orderNumber: o.orderNumber,
          email: o.email,
          firstName: o.firstName,
          lastName: o.lastName,
          address: o.address,
          city: o.city,
          postalCode: o.postalCode,
          country: o.country,
          servicePointName: o.servicePointName,
          deliveryOption: o.deliveryOption,
          subtotal: parseFloat(o.subtotal),
          shippingCost: parseFloat(o.shippingCost),
          discount: parseFloat(o.discount),
          total: parseFloat(o.total),
          depositAmount: (o as { depositAmount?: string | null }).depositAmount != null ? parseFloat((o as { depositAmount: string }).depositAmount) : undefined,
          balanceDue: (o as { balanceDue?: string | null }).balanceDue != null ? parseFloat((o as { balanceDue: string }).balanceDue) : undefined,
          commitsCoreReturnWithin14: (o as { commitsCoreReturnWithin14?: boolean | null }).commitsCoreReturnWithin14 ?? undefined,
          coreKeepFeeSek: (o as { coreKeepFeeSek?: number | null }).coreKeepFeeSek ?? 0,
          coreReturnDeadline: (o as { coreReturnDeadline?: Date | null }).coreReturnDeadline ?? undefined,
          coreReceivedAt: (o as { coreReceivedAt?: Date | null }).coreReceivedAt ?? undefined,
          status: o.status,
          postNordTrackingId: o.postNordTrackingId,
          stripePaymentId: o.stripePaymentId,
          createdAt: o.createdAt,
          items: items.map((i) => ({
            id: i.id,
            productId: i.productId,
            productName: i.productName,
            productImage: i.productImage,
            variant: (i as { variant?: string }).variant ?? null,
            price: parseFloat(i.price),
            quantity: i.quantity,
          })),
        };
      })
    );

    res.json(ordersWithItems);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// GET single order by id — user orders: matching userId; guest orders: matching viewToken (query `token`)
app.get("/api/orders/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.query.userId as string | undefined;
    const token = req.query.token as string | undefined;
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (!canReadOrderWithSecret(order, userId, token)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    res.json({
      id: order.id,
      orderNumber: order.orderNumber,
      email: order.email,
      firstName: order.firstName,
      lastName: order.lastName,
      phone: order.phone,
      address: order.address,
      city: order.city,
      postalCode: order.postalCode,
      country: order.country,
      servicePointName: order.servicePointName,
      servicePointId: order.servicePointId,
      deliveryOption: order.deliveryOption,
      subtotal: parseFloat(order.subtotal),
      shippingCost: parseFloat(order.shippingCost),
      discount: parseFloat(order.discount),
      total: parseFloat(order.total),
      depositAmount: (order as { depositAmount?: string | null }).depositAmount != null ? parseFloat((order as { depositAmount: string }).depositAmount) : undefined,
      balanceDue: (order as { balanceDue?: string | null }).balanceDue != null ? parseFloat((order as { balanceDue: string }).balanceDue) : undefined,
      commitsCoreReturnWithin14: (order as { commitsCoreReturnWithin14?: boolean | null }).commitsCoreReturnWithin14 ?? undefined,
      coreKeepFeeSek: (order as { coreKeepFeeSek?: number | null }).coreKeepFeeSek ?? 0,
      coreReturnDeadline: (order as { coreReturnDeadline?: Date | null }).coreReturnDeadline ?? undefined,
      coreReceivedAt: (order as { coreReceivedAt?: Date | null }).coreReceivedAt ?? undefined,
      status: order.status,
      postNordTrackingId: order.postNordTrackingId,
      stripePaymentId: order.stripePaymentId,
      createdAt: order.createdAt,
      items: items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        productImage: i.productImage,
        variant: (i as { variant?: string }).variant ?? null,
        price: parseFloat(i.price),
        quantity: i.quantity,
      })),
    });
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// GET order balance — requires `token` (= view_token) in query; never trust userId alone
app.get("/api/orders/:id/balance", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const token = req.query.token as string | undefined;
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (!canAccessBalanceWithViewToken(order, token)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const balanceDue = (order as { balanceDue?: string | null }).balanceDue;
    const stripeBalancePaymentId = (order as { stripeBalancePaymentId?: string | null }).stripeBalancePaymentId;
    const bal = balanceDue != null ? parseFloat(balanceDue) : 0;
    if (bal <= 0 || stripeBalancePaymentId) {
      return res.status(400).json({
        error: stripeBalancePaymentId ? "Balance already paid" : "No balance due for this order",
      });
    }
    res.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      balanceDue: bal,
      customerName: `${order.firstName} ${order.lastName}`.trim(),
    });
  } catch (error) {
    console.error("Error fetching order balance:", error);
    res.status(500).json({ error: "Failed to fetch order balance" });
  }
});

// PATCH record balance payment (after customer pays remainder)
app.patch("/api/orders/:id/balance-paid", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as { stripePaymentId?: string; token?: string };
    const stripePaymentId = body?.stripePaymentId;
    const token = typeof body?.token === "string" ? body.token : undefined;
    if (!stripePaymentId || !stripePaymentId.startsWith("pi_")) {
      return res.status(400).json({ error: "Invalid stripePaymentId" });
    }
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (!canAccessBalanceWithViewToken(order, token)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const balanceDue = (order as { balanceDue?: string | null }).balanceDue;
    const existing = (order as { stripeBalancePaymentId?: string | null }).stripeBalancePaymentId;
    if (!balanceDue || parseFloat(balanceDue) <= 0 || existing) {
      return res.status(400).json({ error: "Order has no balance due or already paid" });
    }
    const balanceNum = parseFloat(balanceDue);
    const [piUsed] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        or(eq(orders.stripeBalancePaymentId, stripePaymentId), eq(orders.stripePaymentId, stripePaymentId)),
      )
      .limit(1);
    if (piUsed && piUsed.id !== id) {
      return res.status(400).json({ error: "Payment intent already used" });
    }
    const verified = await verifySucceededBalancePaymentIntent(stripePaymentId, balanceNum);
    if (!verified.ok) {
      return res.status(400).json({ error: verified.error });
    }
    await db
      .update(orders)
      .set({
        stripeBalancePaymentId: stripePaymentId,
        status: "completed",
      } as Record<string, unknown>)
      .where(eq(orders.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error("Error recording balance payment:", error);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

// DELETE product
app.delete("/api/products/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await db.delete(products).where(eq(products.id, id)).returning();
    
    if (deleted.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    res.json({ message: "Product deleted successfully", id });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

const port = Number(process.env.PORT) || 8000;
app.listen(port, () => {
  console.log(`Product service is running on port ${port}`);
});
