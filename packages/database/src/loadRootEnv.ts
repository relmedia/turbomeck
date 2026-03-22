import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Load monorepo root `.env` into `process.env` (for CLI and apps). */
export function loadRootEnv(): void {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // src/ → database/ → packages/ → monorepo root
  const envPath = resolve(__dirname, "../../../.env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eqIdx = t.indexOf("=");
    if (eqIdx === -1) continue;
    const key = t.slice(0, eqIdx).trim();
    let val = t.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // Root `.env` is the single source for DATABASE_URL (overrides per-app `.env` / Docker defaults).
    if (key === "DATABASE_URL" && val) {
      process.env.DATABASE_URL = val;
    } else if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}
