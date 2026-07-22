// Tiny helper to apply a .sql file to DATABASE_URL, used by `npm run migrate`.
// Usage: node -r dotenv/config server/scripts/runSql.js schema.sql
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const relativeSqlPath = process.argv[2];
if (!relativeSqlPath) {
  console.error("Usage: node server/scripts/runSql.js <path-to-sql-file>");
  process.exit(1);
}

const sqlPath = path.resolve(process.cwd(), relativeSqlPath);
const sql = fs.readFileSync(sqlPath, "utf8");

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Copy .env.example to .env and fill in a real Postgres connection string first."
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(sql);
  console.log(`Applied ${relativeSqlPath} to database successfully.`);
} catch (err) {
  console.error("Failed to apply SQL file:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
