require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log("Adding sample_input and sample_output columns to questions table...");
        await pool.query('ALTER TABLE questions ADD COLUMN IF NOT EXISTS sample_input TEXT;');
        await pool.query('ALTER TABLE questions ADD COLUMN IF NOT EXISTS sample_output TEXT;');
        console.log("✅ Columns added successfully.");
    } catch (error) {
        console.error("❌ Migration failed:", error);
    } finally {
        await pool.end();
        process.exit();
    }
}

migrate();
