const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const pool = new Pool({
  connectionString: 'postgresql://vm_1st_run_new_user:PZqhbowXGoaq9t7ayEtpqVzIIfVB7Q1i@dpg-d7dq87rbc2fs73e5sla0-a.singapore-postgres.render.com/vm_1st_run_new',
  ssl: { rejectUnauthorized: false }
});
async function setup() {
  const hash = await bcrypt.hash('password123', 10);
  await pool.query('DELETE FROM users WHERE username = \'test_student\'');
  await pool.query(
    'INSERT INTO users (name, username, password_hash, role, branch, year, section, batch) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    ['Test Student', 'test_student', hash, 'Student', 'CSE', '1', '5', '2025-2029']
  );
  console.log('Test student created');
  pool.end();
}
setup().catch(console.error);
