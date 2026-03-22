#!/usr/bin/env node
/**
 * Debug: product-service + optional Next proxy + env hints (no secrets in logs).
 * Run from repo root: pnpm debug:products
 */
// #region agent log
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "../..");
const LOG_FILE = path.join(REPO_ROOT, "debug-e93869.log");
const SESSION_ID = "e93869";
const INGEST =
  "http://127.0.0.1:7853/ingest/a34f3511-3fde-4631-9546-6f9d6739df56";

function debugLog({ hypothesisId, location, message, data = {} }) {
  const payload = {
    sessionId: SESSION_ID,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  try {
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(payload)}\n`);
  } catch {
    /* ignore */
  }
  fetch(INGEST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": SESSION_ID,
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
// #endregion

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function safeDbUrl(url) {
  if (!url) return { present: false };
  try {
    const u = new URL(url);
    return {
      present: true,
      host: u.hostname,
      port: u.port || "(default 5432)",
      database: u.pathname.replace(/^\//, "") || "(none)",
      userSet: Boolean(u.username),
    };
  } catch {
    return { present: true, parseError: true };
  }
}

async function tryFetch(label, url, hypothesisId) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    let preview = text.slice(0, 280);
    let isArray = false;
    let itemCount = null;
    try {
      const j = JSON.parse(text);
      if (Array.isArray(j)) {
        isArray = true;
        itemCount = j.length;
      } else if (j && typeof j === "object" && "error" in j) {
        preview = JSON.stringify({ error: j.error });
      }
    } catch {
      /* not JSON */
    }
    debugLog({
      hypothesisId,
      location: "product-pipeline.mjs:tryFetch",
      message: label,
      data: {
        url,
        ok: res.ok,
        status: res.status,
        preview,
        isArray,
        itemCount,
      },
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    debugLog({
      hypothesisId,
      location: "product-pipeline.mjs:tryFetch",
      message: `${label} (network error)`,
      data: {
        url,
        errorName: e?.name,
        errorMessage: String(e?.message ?? e),
      },
    });
    return { ok: false, status: 0 };
  }
}

async function main() {
  const productBase =
    process.env.PRODUCT_SERVICE_URL ||
    process.env.NEXT_PUBLIC_PRODUCT_API_URL ||
    "http://127.0.0.1:8000";
  const clientBase =
    process.env.DEBUG_CLIENT_URL || "http://127.0.0.1:3002";

  const rootEnv = loadEnvFile(path.join(REPO_ROOT, ".env"));
  const psEnv = loadEnvFile(
    path.join(REPO_ROOT, "apps/product-service/.env"),
  );

  debugLog({
    hypothesisId: "H2",
    location: "product-pipeline.mjs:main",
    message: "Env snapshot (DATABASE_URL from root vs product-service)",
    data: {
      rootDatabaseUrl: safeDbUrl(rootEnv.DATABASE_URL),
      productServiceHasDatabaseUrlKey: Object.prototype.hasOwnProperty.call(
        psEnv,
        "DATABASE_URL",
      ),
      productServiceDatabaseUrl: psEnv.DATABASE_URL
        ? safeDbUrl(psEnv.DATABASE_URL)
        : { present: false },
    },
  });

  debugLog({
    hypothesisId: "H1",
    location: "product-pipeline.mjs:main",
    message: "Product service base URL",
    data: { productBase },
  });

  await tryFetch(
    "Direct product-service GET /api/products",
    `${productBase.replace(/\/$/, "")}/api/products`,
    "H1",
  );
  await tryFetch(
    "Direct product-service GET /api/categories",
    `${productBase.replace(/\/$/, "")}/api/categories`,
    "H1",
  );

  await tryFetch(
    "Next.js proxy GET /api/product/products (browser path)",
    `${clientBase.replace(/\/$/, "")}/api/product/products`,
    "H4",
  );

  debugLog({
    hypothesisId: "H5",
    location: "product-pipeline.mjs:main",
    message: "Pipeline script finished",
    data: {},
  });

  // eslint-disable-next-line no-console
  console.log(
    `Debug run complete. NDJSON appended to ${path.relative(REPO_ROOT, LOG_FILE) || LOG_FILE}`,
  );
}

main().catch((e) => {
  debugLog({
    hypothesisId: "H0",
    location: "product-pipeline.mjs:main",
    message: "Script fatal",
    data: { errorMessage: String(e?.message ?? e) },
  });
  console.error(e);
  process.exit(1);
});
