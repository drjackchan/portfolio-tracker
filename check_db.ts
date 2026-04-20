import { Pool } from "pg";

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL or POSTGRES_URL is not set");
  process.exit(1);
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function check() {
  try {
    const client = await pool.connect();
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log("Tables:", res.rows.map(r => r.table_name));
    client.release();
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await pool.end();
  }
}

check();
