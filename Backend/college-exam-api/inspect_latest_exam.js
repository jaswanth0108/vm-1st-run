require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function checkLatest() {
    try {
        const { rows } = await pool.query("SELECT * FROM exams ORDER BY id DESC LIMIT 1");
        if (rows.length === 0) { console.log("No exams"); return; }
        const exam = rows[0];
        console.log("Latest Exam:", exam.title, "ID:", exam.id);
        const { rows: questions } = await pool.query("SELECT id, test_cases, sample_input, sample_output FROM questions WHERE exam_id = $1", [exam.id]);
        console.log("Questions data inside db:", JSON.stringify(questions, null, 2));
    } catch(e) {
        console.error(e);
    } finally {
        await pool.end();
        process.exit();
    }
}
checkLatest();
