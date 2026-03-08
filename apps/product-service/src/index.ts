import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db, products, categories, productCategories, orders, orderItems, reviews, users } from "@repo/database";
import { eq, inArray, desc, sql } from "drizzle-orm";
import { processProductImage } from "./image-utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Configure multer for file uploads
const UPLOAD_DIR = path.resolve(__dirname, "../../admin/public/uploads");

// Ensure upload directory exists
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
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed."));
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

// Upload image endpoint
app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const inputPath = path.join(UPLOAD_DIR, req.file.filename);

    const { filename } = await processProductImage(inputPath);

    const imageUrl = `/uploads/${filename}`;
    res.json({
      success: true,
      url: imageUrl,
      filename,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// List upload files (for attaching existing files to products)
app.get("/api/upload", async (req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
    const imageFiles = files
      .filter((f) => imageExtensions.includes(path.extname(f).toLowerCase()))
      .map((f) => `/uploads/${f}`)
      .sort();
    res.json({ files: imageFiles });
  } catch (error) {
    console.error("Error listing uploads:", error);
    res.status(500).json({ error: "Failed to list uploads" });
  }
});

// Remove background from existing image
app.post("/api/upload/remove-background", express.json(), async (req, res) => {
  try {
    const { filename, url } = req.body || {};
    const basename =
      typeof filename === "string"
        ? filename.replace(/^.*[/\\]/, "")
        : typeof url === "string"
          ? url.replace(/^.*[/\\]/, "").split("?")[0]
          : null;
    if (!basename) {
      return res.status(400).json({ error: "filename or url required" });
    }
    const filePath = path.join(UPLOAD_DIR, basename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    const { filename: outFilename } = await processProductImage(filePath);
    res.json({ success: true, url: `/uploads/${outFilename}`, filename: outFilename });
  } catch (error) {
    console.error("Error removing background:", error);
    res.status(500).json({ error: "Failed to remove background" });
  }
});

// Delete image endpoint
app.delete("/api/upload/:filename", (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(UPLOAD_DIR, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: "File deleted successfully" });
    } else {
      res.status(404).json({ error: "File not found" });
    }
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).json({ error: "Failed to delete file" });
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
    res.status(500).json({ error: "Failed to fetch categories" });
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

// GET all products (optional ?ids=1,2,3 for filtering, ?locale=sv|en for translated content)
app.get("/api/products", async (req, res) => {
  try {
    const idsParam = req.query.ids as string | undefined;
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
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    };
    const allProducts = filterIds?.length
      ? await db.select(productCols).from(products).where(inArray(products.id, filterIds))
      : await db.select(productCols).from(products);
    const productIds = allProducts.map((p) => p.id);
    const categoryMap = await getProductCategoryIds(productIds);
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
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
    });
    res.json(formatted);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
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
    const { name, shortDescription, description, price, image, thumbnails, stock, weight, categoryIds, attributes, nameEn, shortDescriptionEn, descriptionEn } = req.body;

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

async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(sql`extract(year from ${orders.createdAt}) = ${year}`);
  const seq = ((result[0]?.count ?? 0) + 1).toString().padStart(4, "0");
  return `TM-${year}-${seq}`;
}

// POST create order (checkout)
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
      subtotal: number;
      shippingCost: number;
      discount?: number;
      total: number;
      stripePaymentId?: string;
      postNordTrackingId?: string;
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
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ error: "Order must have at least one item" });
    }

    const orderNumber = await generateOrderNumber();

    const [order] = await db
      .insert(orders)
      .values({
        orderNumber,
        userId: body.userId ?? null,
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
        subtotal: String(body.subtotal),
        shippingCost: String(body.shippingCost),
        discount: String(body.discount ?? 0),
        total: String(body.total),
        stripePaymentId: body.stripePaymentId ?? null,
        postNordTrackingId: body.postNordTrackingId ?? null,
      })
      .returning();

    await db.insert(orderItems).values(
      body.items.map((item) => ({
        orderId: order.id,
        productId: item.productId ?? null,
        productName: item.productName,
        productImage: item.productImage ?? null,
        variant: item.variant ?? null,
        price: String(item.price),
        quantity: item.quantity,
      }))
    );

    res.status(201).json({
      id: order.id,
      orderNumber: order.orderNumber,
      postNordTrackingId: order.postNordTrackingId,
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// GET orders for user (by userId or email)
app.get("/api/orders", async (req, res) => {
  try {
    const { userId, email } = req.query as { userId?: string; email?: string };

    if (!userId && !email) {
      return res.status(400).json({ error: "Provide userId or email" });
    }

    const conditions = userId
      ? eq(orders.userId, userId)
      : eq(orders.email, String(email));

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

// GET single order by id (for detail view) - requires userId when order belongs to a user
app.get("/api/orders/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.query.userId as string | undefined;
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (order.userId && userId !== order.userId) {
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

app.listen(8000, () => {
  console.log("Product service is running on port 8000");
});
