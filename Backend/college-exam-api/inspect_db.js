const pool = require('./src/config/db');

async function checkDetailedSchema() {
  try {
    console.log('--- Checking Table Definitions ---');
    const tables = ['users', 'submissions', 'reports'];
    for (const table of tables) {
      const { rows } = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table]);
      console.log(`\nTable: ${table}`);
      console.table(rows);
    }

    console.log('\n--- Checking Foreign Key Constraints ---');
    const { rows: constraints } = await pool.query(`
      SELECT
          tc.table_name, 
          kcu.column_name, 
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule
      FROM 
          information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
          JOIN information_schema.referential_constraints AS rc
            ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND (tc.table_name = 'submissions' OR tc.table_name = 'reports');
    `);
    console.table(constraints);

    process.exit(0);
  } catch (err) {
    console.error('DATABASE ERROR:', err);
    process.exit(1);
  }
}

checkDetailedSchema();
