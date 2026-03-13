const pool = require('./src/config/db');

async function checkSchema() {
  try {
    const { rows } = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'exams'
    `);
    const columns = rows.map(r => r.column_name.toLowerCase());
    console.log('--- Exams Table Columns ---');
    console.log(JSON.stringify(columns));
    
    if (columns.includes('status') && (columns.includes('branch') || columns.includes('branch_json'))) {
      console.log('SCHEMA SUCCESS: Required columns exist.');
    } else {
      console.log('SCHEMA ERROR: Missing status or branch columns.');
    }
    
    // Check if any exams exist
    const { rowCount } = await pool.query('SELECT * FROM exams');
    console.log(`Total Exams in DB: ${rowCount}`);
    
    process.exit(0);
  } catch (err) {
    console.error('DATABASE ERROR:', err);
    process.exit(1);
  }
}

checkSchema();
