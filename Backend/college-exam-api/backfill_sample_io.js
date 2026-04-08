/**
 * Backfill Migration Script
 * 
 * Copies the FIRST test case's input/output from test_cases JSONB column
 * into the new sample_input and sample_output columns for all existing
 * coding questions that have test_cases data but no sample_input yet.
 * 
 * This makes all existing exams show sample I/O to students immediately.
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function backfill() {
    try {
        console.log("=== BACKFILL: Populating sample_input/sample_output for existing questions ===\n");

        // Find all coding questions that have test_cases but no sample_input
        const { rows } = await pool.query(`
            SELECT id, exam_id, test_cases 
            FROM questions 
            WHERE type = 'Coding' 
            AND test_cases IS NOT NULL 
            AND sample_input IS NULL
        `);

        console.log(`Found ${rows.length} coding questions without sample_input.\n`);

        let updated = 0;
        let skipped = 0;

        for (const q of rows) {
            let cases = q.test_cases;
            // test_cases can be a JSON array or a string
            if (typeof cases === 'string') {
                try { cases = JSON.parse(cases); } catch { cases = null; }
            }

            // Pick the FIRST test case as the sample (public visible) test case
            if (Array.isArray(cases) && cases.length > 0 && (cases[0].input || cases[0].output)) {
                const sampleInput = cases[0].input || '';
                const sampleOutput = cases[0].output || '';

                await pool.query(
                    'UPDATE questions SET sample_input = $1, sample_output = $2 WHERE id = $3',
                    [sampleInput, sampleOutput, q.id]
                );
                console.log(`  ✅ Updated question ${q.id} (exam ${q.exam_id}): input="${sampleInput}", output="${sampleOutput}"`);
                updated++;
            } else {
                console.log(`  ⚠️  Skipped question ${q.id}: no valid test_cases data.`);
                skipped++;
            }
        }

        console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}`);
        console.log("\nStudents will now see sample input/output for ALL existing exams.");

    } catch (err) {
        console.error("Migration error:", err.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

backfill();
