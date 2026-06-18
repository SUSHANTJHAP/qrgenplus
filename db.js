require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const initDB = async () => {
  try {
    // Users Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE,
        email VARCHAR(255) UNIQUE,
        password_hash TEXT,
        subscribed BOOLEAN DEFAULT false,
        stripe_customer_id VARCHAR(255)
      )
    `);

    // Links Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS links (
        short_id VARCHAR(255) PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id),
        original_title VARCHAR(255),
        target_url TEXT,
        scan_count INTEGER DEFAULT 0,
        password VARCHAR(255),
        ios_url TEXT,
        android_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Scan History Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scan_history (
        id SERIAL PRIMARY KEY,
        link_id VARCHAR(255) REFERENCES links(short_id) ON DELETE CASCADE,
        scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        country VARCHAR(255),
        city VARCHAR(255),
        os VARCHAR(255),
        browser VARCHAR(255),
        device_type VARCHAR(255)
      )
    `);
    
    console.log("Database schema initialized.");
  } catch (err) {
    console.error("Failed to initialize database:", err);
  }
};

initDB();

module.exports = pool;
