const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Use the External Database URL from Render
const connectionString = process.argv[2] || process.env.DATABASE_URL;

if (!connectionString && !process.env.DB_HOST) {
  console.error('Error: No database configuration found.');
  console.log('Provide an External Database URL or set DB_HOST in your .env file.');
  process.exit(1);
}

if (connectionString) console.log('Using provided Connection String.');
else console.log(`Using Database Host: ${process.env.DB_HOST}`);

const poolConfig = connectionString ? {
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
} : {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT) || 5432,
  ssl: process.env.DB_HOST !== 'localhost' ? { rejectUnauthorized: false } : false
};

const pool = new Pool(poolConfig);

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
