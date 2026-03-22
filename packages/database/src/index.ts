import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Default only when unset (local dev). Docker Compose often uses 5433 — set DATABASE_URL in root `.env`.
const connectionString =
  process.env.DATABASE_URL ||
  (() => {
    console.warn(
      "[@repo/database] DATABASE_URL is unset; using dev default postgresql://postgres:postgres@127.0.0.1:5432/turbodb",
    );
    return "postgresql://postgres:postgres@127.0.0.1:5432/turbodb";
  })();

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

