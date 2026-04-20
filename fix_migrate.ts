import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

async function run() {
  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL or POSTGRES_URL is not set");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  const db = drizzle(pool);

  try {
    console.log("Creating subscriptions table...");
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
    console.log("Success!");
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await pool.end();
  }
}

run();
