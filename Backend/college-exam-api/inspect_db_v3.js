const pool = require('./src/config/db');

async function checkAllForeignKeys() {
  try {
    console.log('--- Foreign Keys referencing users ---');
    const { rows } = await pool.query(`
      SELECT
          tc.table_name, 
          kcu.column_name, 
          ccu.table_name AS foreign_table,
          ccu.column_name AS foreign_column,
          rc.delete_rule
      FROM 
          information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.table_schema ts ON ts.schema_name = tc.table_schema
          JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
          JOIN information_schema.referential_constraints AS rc ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'users';
    `);
    rows.forEach(c => console.log(`  ${c.table_name}.${c.column_name} -> ${c.foreign_table}.${c.foreign_column} (${c.delete_rule})`));

    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}

checkAllForeignKeys();
