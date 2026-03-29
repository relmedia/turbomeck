/**
 * PM2 loads this file with Node — it does NOT automatically load each app’s `.env`.
 * Older PM2 ignores `env_file`; Next `next start` loads .env from cwd, but SSR still
 * needs DATABASE_URL etc. for @repo/auth/@repo/database in some code paths.
 *
 * We merge each app’s `.env` into `env` so production always has
 * INTERNAL_PRODUCT_API_SECRET, DATABASE_URL, PRODUCT_SERVICE_URL, …
 */
const fs = require("fs");
const path = require("path");

function loadDotenv(relDirFromRepoRoot) {
  const full = path.join(__dirname, relDirFromRepoRoot, ".env");
  if (!fs.existsSync(full)) {
    console.warn(`[ecosystem.config] Missing ${full} — add it on the server (not in git).`);
    return {};
  }
  const env = {};
  const raw = fs.readFileSync(full, "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

/** If admin .env uses the shop apex for auth URLs, PM2 must rewrite to the studio host (see apps/admin/next.config). */
function coerceAdminMagicLinkOrigin(env, raw) {
  if (!raw || typeof raw !== "string") return raw;
  const t = raw.trim();
  const studio = (env.ADMIN_STUDIO_HOSTNAME || "studio.turbomeck.cloud").trim();
  const apex = new Set(
    (env.ADMIN_SHOP_AUTH_HOSTNAMES || "turbomeck.cloud,www.turbomeck.cloud")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean),
  );
  try {
    const url = new URL(t);
    if (apex.has(url.hostname)) {
      url.hostname = new URL(`https://${studio}`).hostname;
      return url.origin;
    }
    return t.replace(/\/$/, "");
  } catch {
    return t;
  }
}

const productServiceEnv = loadDotenv("apps/product-service");
const clientEnv = loadDotenv("apps/client");
const adminEnv = loadDotenv("apps/admin");
const paymentEnv = loadDotenv("apps/payment-service");

if (!productServiceEnv.INTERNAL_PRODUCT_API_SECRET) {
  console.warn(
    "[ecosystem.config] apps/product-service/.env should set INTERNAL_PRODUCT_API_SECRET",
  );
}
if (!clientEnv.INTERNAL_PRODUCT_API_SECRET) {
  console.warn(
    "[ecosystem.config] apps/client/.env should set INTERNAL_PRODUCT_API_SECRET (same value as product-service) or /api/product returns 503",
  );
}
if (!productServiceEnv.DATABASE_URL) {
  console.warn(
    "[ecosystem.config] apps/product-service/.env should set DATABASE_URL — without it @repo/database uses a dev default and /api/categories may 500",
  );
}

module.exports = {
  apps: [
    {
      name: "product-service",
      cwd: "./apps/product-service",
      script: "pnpm",
      args: "start",
      env: { ...productServiceEnv, PORT: "8000" },
      instances: 1,
      autorestart: true,
      watch: false,
    },
    {
      name: "payment-service",
      cwd: "./apps/payment-service",
      script: "pnpm",
      args: "start",
      env: { ...paymentEnv, PORT: "8002" },
      instances: 1,
      autorestart: true,
      watch: false,
    },
    {
      name: "client",
      cwd: "./apps/client",
      script: "pnpm",
      args: "start",
      env: {
        ...clientEnv,
        PORT: "3000",
        // SSR catalog fetches talk to product-service on the same host if unset:
        PRODUCT_SERVICE_URL: clientEnv.PRODUCT_SERVICE_URL || "http://127.0.0.1:8000",
      },
      instances: 1,
      autorestart: true,
      watch: false,
    },
    {
      name: "admin",
      cwd: "./apps/admin",
      script: "pnpm",
      args: "start",
      env: {
        ...adminEnv,
        AUTH_SIGNIN_PATH: "/",
        AUTH_VERIFY_PATH: adminEnv.AUTH_VERIFY_PATH?.trim() || "/studio/verify",
        ...((): Record<string, string> => {
          const raw = (
            adminEnv.ADMIN_CANONICAL_ORIGIN ||
            adminEnv.NEXTAUTH_URL ||
            adminEnv.AUTH_URL ||
            ""
          ).trim();
          const out = { STUDIO_AUTH_MAGIC_LINKS: "1" };
          if (!raw) return out;
          const fixed = coerceAdminMagicLinkOrigin(adminEnv, raw);
          out.AUTH_URL = fixed;
          out.NEXTAUTH_URL = fixed;
          out.PUBLIC_AUTH_ORIGIN = fixed;
          return out;
        })(),
        PORT: "3001",
      },
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};
