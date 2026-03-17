const pool = require('./src/config/db');

async function checkUsersSchema() {
  try {
    const { rows } = await pool.query(`
      SELECT
        kcu.column_name,
        tco.constraint_type
      FROM information_schema.table_constraints tco
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tco.constraint_name
        AND kcu.table_schema = tco.table_schema
        AND kcu.table_name = tco.table_name
      WHERE tco.table_name = 'users'
    `);
    console.log('--- Users Table Constraints ---');
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('DATABASE ERROR:', err);
    process.exit(1);
  }
}

checkUsersSchema();
