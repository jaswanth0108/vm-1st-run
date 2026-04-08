require('dotenv').config();
const pool = require('./src/config/db');

async function runMigration() {
    try {
        console.log('Running migration...');
        await pool.query('ALTER TABLE answers ADD COLUMN IF NOT EXISTS test_cases_passed JSONB DEFAULT NULL;');
        console.log('Migration successful. Column test_cases_passed added to answers table.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
        process.exit();
    }
}

runMigration();
