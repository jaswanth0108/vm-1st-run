const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  max: 10,
  idleTimeoutMillis: 30000
});

// Wrapper to mimic mysql2's pool.execute so we don't have to change 
// the word "execute" everywhere in our service files.
pool.execute = async (text, params) => {
  const { rows, command } = await pool.query(text, params);
  // Mimic MySQL insertId structure
  if (command === 'INSERT' && rows.length > 0) {
    return [{ insertId: rows[0].id }, null];
  }
  return [rows, null];
};

module.exports = pool;
