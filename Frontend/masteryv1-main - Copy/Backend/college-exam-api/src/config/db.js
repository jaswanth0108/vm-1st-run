const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DATABASE_URL ? undefined : process.env.DB_HOST,
  user: process.env.DATABASE_URL ? undefined : process.env.DB_USER,
  password: process.env.DATABASE_URL ? undefined : process.env.DB_PASSWORD,
  database: process.env.DATABASE_URL ? undefined : process.env.DB_NAME,
  port: process.env.DATABASE_URL ? undefined : (process.env.DB_PORT || 5432),
  max: 30, // Increased from 10 to support more concurrent students
  idleTimeoutMillis: 30000,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Wrapper to mimic mysql2's pool.execute — now a safe passthrough to pool.query
// so any legacy callers still work with standard pg { rows } destructuring
pool.execute = (text, params) => pool.query(text, params);


module.exports = pool;
