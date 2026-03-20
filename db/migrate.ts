import { sql } from "@vercel/postgres";

/**
 * Creates the tables directly using SQL — no migration files needed.
 * Uses @vercel/postgres HTTP transport so it never blocks the Lambda event loop.
 * This runs fire-and-forget at cold start when DATABASE_URL / POSTGRES_URL is set.
 */
export async function runMigrations() {
  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) return;

  await sql`
    CREATE TABLE IF NOT EXISTS assets (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      ticker        TEXT,
      asset_type    TEXT NOT NULL,
      quantity      REAL NOT NULL,
      purchase_price REAL NOT NULL,
      current_price  REAL NOT NULL,
      currency      TEXT NOT NULL DEFAULT 'USD',
      notes         TEXT,
      purchase_date TEXT,
      category      TEXT
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id        SERIAL PRIMARY KEY,
      asset_id  INTEGER NOT NULL,
      type      TEXT NOT NULL,
      quantity  REAL NOT NULL,
      price     REAL NOT NULL,
      date      TEXT NOT NULL,
      notes     TEXT
    );
  `;

  console.log("[db] Tables ready");
}
