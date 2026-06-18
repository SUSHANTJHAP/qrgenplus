require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await pool.query(`ALTER TABLE links ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255);`);
    console.log("Column custom_domain added to links table.");
  } catch (err) {
    console.error("Error updating schema:", err);
  } finally {
    await pool.end();
  }
}

run();
