import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { loadRootEnv } from "./loadRootEnv";

loadRootEnv();

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5433/turbodb";

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

