import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Resolve the database connection string.
 *
 * In production we fail hard if `DATABASE_URL` is unset (audit L7). Silently
 * falling back to `postgres:postgres@127.0.0.1` masked outages and — worse —
 * could have a production process write into the wrong database when the env
 * was misconfigured. Local dev still gets the default, with a warning.
 */
function resolveConnectionString(): string {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[@repo/database] DATABASE_URL is required in production. Refusing to start.",
    );
  }
  console.warn(
    "[@repo/database] DATABASE_URL is unset; using dev default postgresql://postgres:postgres@127.0.0.1:5432/turbodb",
  );
  return "postgresql://postgres:postgres@127.0.0.1:5432/turbodb";
}

const connectionString = resolveConnectionString();

// Limit pool size to avoid "too many clients" (client + admin + product-service share DB)
const client = postgres(connectionString, {
  max: 5,
  idle_timeout: 20,
});

// Create drizzle instance with schema
export const db = drizzle(client, { schema });

// Export everything from schema for convenience
export * from "./schema";

// Export types
export type Database = typeof db;

