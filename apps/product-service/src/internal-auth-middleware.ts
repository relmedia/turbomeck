import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";

const SECRET = process.env.INTERNAL_PRODUCT_API_SECRET?.trim();

/**
 * Require `Authorization: Bearer <INTERNAL_PRODUCT_API_SECRET>` or header
 * `X-Internal-Product-Api-Secret: <same>` for every /api request except GET /api/health/db (still localhost-only there).
 */
export function internalProductApiAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Mounted at app.use("/api", …) — path is relative (e.g. /health/db)
  if (req.method === "GET" && (req.path === "/health/db" || req.path === "/api/health/db")) {
    next();
    return;
  }

  if (!SECRET) {
    console.error(
      "[product-service] INTERNAL_PRODUCT_API_SECRET is not set; refusing API traffic."
    );
    res.status(503).json({ error: "Server misconfiguration" });
    return;
  }

  const authHeader = req.headers.authorization;
  const bearer =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
  const alt =
    typeof req.headers["x-internal-product-api-secret"] === "string"
      ? req.headers["x-internal-product-api-secret"].trim()
      : "";
  const token = bearer || alt;

  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(SECRET, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
