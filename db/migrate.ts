import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

/**
 * Creates the tables directly using SQL — no migration files needed.
 * This runs at server startup when DATABASE_URL is set.
 */
export async function runMigrations() {
  if (!process.env.DATABASE_URL) return;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,  // fail fast if DB unreachable
    idleTimeoutMillis: 1000,        // don't keep function alive after done
    max: 1,
  });

  const db = drizzle(pool);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS assets (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      ticker      TEXT,
      asset_type  TEXT NOT NULL,
      quantity    REAL NOT NULL,
      purchase_price REAL NOT NULL,
      current_price  REAL NOT NULL,
      currency    TEXT NOT NULL DEFAULT 'USD',
      notes       TEXT,
      purchase_date TEXT,
      category    TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id        SERIAL PRIMARY KEY,
      asset_id  INTEGER NOT NULL,
      type      TEXT NOT NULL,
      quantity  REAL NOT NULL,
      price     REAL NOT NULL,
      date      TEXT NOT NULL,
      notes     TEXT
    );
  `);

  await pool.end();
  console.log("[db] Tables ready");
}
