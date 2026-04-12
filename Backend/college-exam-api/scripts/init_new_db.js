/**
 * One-time script to initialize the new Render PostgreSQL database.
 * Run with: node scripts/init_new_db.js
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = 'postgresql://vm_1st_run_new_user:PZqhbowXGoaq9t7ayEtpqVzIIfVB7Q1i@dpg-d7dq87rbc2fs73e5sla0-a.singapore-postgres.render.com/vm_1st_run_new';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function init() {
  try {
    console.log('🔌 Connecting to new Render database...');
    
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected successfully!\n');

    // Run init.sql to create all tables
    const sqlFile = path.join(__dirname, '../src/config/init.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    console.log('📄 Running init.sql to create tables...');
    await pool.query(sql);
    console.log('✅ All tables created successfully!\n');

    // Insert/update the admin user with a pre-hashed password for Vm@cse5
    // Hash: $2b$10$NndLqRzr0bc4JQ9gEiQmI.hdyr3wfpKIe6R4ADU9lOwcdM89/mc32
    const adminHash = '$2b$10$NndLqRzr0bc4JQ9gEiQmI.hdyr3wfpKIe6R4ADU9lOwcdM89/mc32';
    await pool.query(
      `INSERT INTO users (name, username, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO UPDATE SET password_hash = $3`,
      ['Administrator', 'admin', adminHash, 'admin']
    );
    console.log('✅ Admin user created (username: admin, password: Vm@cse5)\n');

    // Verify tables were created
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' ORDER BY table_name`
    );
    console.log('📋 Tables in database:');
    rows.forEach(r => console.log('   -', r.table_name));

    console.log('\n🎉 Database initialization COMPLETE! Your app is ready.');

  } catch (e) {
    console.error('❌ ERROR:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

init();
