import pg, { QueryResultRow } from "pg";
import { env } from "./env.js";

// A single shared connection pool. If DATABASE_URL is still the placeholder
// from .env.example, we still construct the pool (so the server boots and
// serves static/health routes) but every query will fail loudly and clearly
// until a real connection string is provided.
// Supabase (and most hosted Postgres) require TLS. Setting ssl here means the
// connection string doesn't need ?sslmode=require. rejectUnauthorized: false
// skips CA verification, which is what hosted providers using their own chain
// generally need — the traffic is still encrypted.
export const pool = new pg.Pool({
  connectionString: env.databaseUrl || undefined,
  max: 10,
  ssl: { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client", err);
});

export async function query<T extends QueryResultRow = any>(text: string, params: any[] = []) {
  if (!env.isDatabaseConfigured) {
    throw new Error(
      "DATABASE_URL is not configured. Copy .env.example to .env and set a real Postgres connection string (Supabase-compatible)."
    );
  }
  return pool.query<T>(text, params);
}
