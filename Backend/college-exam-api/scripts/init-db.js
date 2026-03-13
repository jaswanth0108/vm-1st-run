const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Use the External Database URL from Render
const connectionString = process.argv[2] || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Error: Please provide your External Database URL.');
  console.log('Usage: node scripts/init-db.js "your_external_url_here"');
  process.exit(1);
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function initialize() {
  const sqlPath = path.join(__dirname, '../src/config/init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Connecting to database...');
  const client = await pool.connect();
  
  try {
    console.log('Running init.sql...');
    await client.query(sql);
    console.log('✅ Database initialized successfully!');
  } catch (err) {
    console.error('❌ Error initializing database:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

initialize();
