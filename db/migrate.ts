import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

/**
 * Creates the tables directly using SQL — no migration files needed.
 * Uses allowExitOnIdle so the pool doesn't block Lambda from exiting.
 */
export async function runMigrations() {
  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!dbUrl) return;

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes("localhost") ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 500,
    allowExitOnIdle: true,
    max: 1,
  });

  const db = drizzle(pool);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS assets (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      ticker        TEXT,
      asset_type    TEXT NOT NULL,
      quantity      REAL NOT NULL,
      purchase_price REAL NOT NULL,
      current_price  REAL NOT NULL,
      currency      TEXT NOT NULL DEFAULT 'HKD',
      notes         TEXT,
      purchase_date TEXT,
      category      TEXT
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS liabilities (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      type          TEXT NOT NULL,
      balance       REAL NOT NULL,
      interest_rate REAL NOT NULL DEFAULT 0,
      currency      TEXT NOT NULL DEFAULT 'HKD',
      notes         TEXT
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id                SERIAL PRIMARY KEY,
      name              TEXT NOT NULL,
      amount            REAL NOT NULL,
      currency          TEXT NOT NULL DEFAULT 'HKD',
      frequency         TEXT NOT NULL DEFAULT 'monthly',
      category          TEXT,
      next_billing_date TEXT,
      status            TEXT NOT NULL DEFAULT 'active',
      notes             TEXT
    );
  `);

  await db.execute(sql`
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

  await db.execute(sql`
    ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS total_liability REAL NOT NULL DEFAULT 0;
  `);

  await db.execute(sql`
    ALTER TABLE liabilities ADD COLUMN IF NOT EXISTS interest_rate REAL NOT NULL DEFAULT 0;
  `);

  await pool.end();
  console.log("[db] Tables ready");
}
