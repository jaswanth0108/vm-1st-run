require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixCascades() {
    try {
        console.log('Connecting to database to fix cascade constraints...');
        
        // Define the foreign key constraints to fix
        const constraints = [
            { table: 'submissions', column: 'student_id', refTable: 'users', refColumn: 'id' },
            { table: 'submissions', column: 'exam_id', refTable: 'exams', refColumn: 'id' },
            { table: 'reports', column: 'student_id', refTable: 'users', refColumn: 'id' },
            { table: 'reports', column: 'exam_id', refTable: 'exams', refColumn: 'id' },
            { table: 'reports', column: 'submission_id', refTable: 'submissions', refColumn: 'id' },
            { table: 'answers', column: 'submission_id', refTable: 'submissions', refColumn: 'id' },
            { table: 'answers', column: 'question_id', refTable: 'questions', refColumn: 'id' },
            { table: 'questions', column: 'exam_id', refTable: 'exams', refColumn: 'id' }
        ];

        for (const { table, column, refTable, refColumn } of constraints) {
            // Find the name of the existing constraint
            const res = await pool.query(`
                SELECT tc.constraint_name
                FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND tc.table_name = $1
                  AND kcu.column_name = $2;
            `, [table, column]);

            if (res.rows.length > 0) {
                const constraintName = res.rows[0].constraint_name;
                console.log(`Found constraint ${constraintName} on ${table}.${column}. Updating to ON DELETE CASCADE...`);
                
                await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraintName}`);
                await pool.query(`
                    ALTER TABLE ${table} 
                    ADD CONSTRAINT ${constraintName} 
                    FOREIGN KEY (${column}) 
                    REFERENCES ${refTable}(${refColumn}) 
                    ON DELETE CASCADE
                `);
                console.log(`Successfully updated ${constraintName}`);
            } else {
                console.log(`No constraint found for ${table}.${column}`);
            }
        }
        console.log('Finished updating cascade constraints.');
    } catch (e) {
        console.error('Error fixing cascades:', e);
    } finally {
        await pool.end();
    }
}

fixCascades();
