const pool = require('./src/config/db');

async function checkDetailedSchema() {
  try {
    const tables = ['users', 'submissions', 'reports'];
    for (const table of tables) {
      const { rows } = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table]);
      console.log(`Table: ${table}`);
      rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));
    }

    console.log('\nForeign Keys:');
    const { rows: constraints } = await pool.query(`
      SELECT
          tc.table_name, 
          kcu.column_name, 
          ccu.table_name AS foreign_table,
          rc.delete_rule
      FROM 
          information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
          JOIN information_schema.referential_constraints AS rc ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND (tc.table_name = 'submissions' OR tc.table_name = 'reports');
    `);
    constraints.forEach(c => console.log(`  ${c.table_name}.${c.column_name} -> ${c.foreign_table} (${c.delete_rule})`));

    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}

checkDetailedSchema();
