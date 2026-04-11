import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL is required in production");
}

const useSsl =
  process.env.DATABASE_SSL === "true" ||
  databaseUrl?.includes("supabase.co") ||
  databaseUrl?.includes("sslmode=require");

function normalizedConnectionString(connectionString: string | undefined) {
  if (!connectionString) {
    return connectionString;
  }

  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  return url.toString();
}

export const pool = new Pool({
  connectionString: normalizedConnectionString(databaseUrl),
  max: Number(process.env.DATABASE_POOL_SIZE || 5),
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
