require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const examService = require('./src/services/examService');

async function testSampleIO() {
    let newExamId = null;
    try {
        console.log("--- Starting Sample I/O Test ---");
        
        // 1. Create a dummy exam directly in DB to test question insertion
        const examRes = await pool.query(
            "INSERT INTO exams (title, status, attempt_limit, duration_minutes, start_time, end_time) VALUES ('Test Sample IO Exam', 'published', 1, 60, NOW(), NOW() + INTERVAL '1 hour') RETURNING id"
        );
        newExamId = examRes.rows[0].id;
        console.log(`Created test exam with ID: ${newExamId}`);

        // 2. Add a coding question with testIn and testOut
        const questions = [
            {
                type: 'coding',
                text: 'Print hello world',
                marks: 10,
                testIn: 'Input 123',
                testOut: 'Output 123',
                hiddenCases: [{ input: 'Hidden In', output: 'Hidden Out' }]
            }
        ];
        
        await examService.addQuestions(newExamId, questions);
        console.log("Added coding question to exam.");

        // 3. Direct DB Check
        const dbCheck = await pool.query("SELECT sample_input, sample_output FROM questions WHERE exam_id = $1", [newExamId]);
        console.log("DB Raw Data:", dbCheck.rows[0]);
        if (dbCheck.rows[0].sample_input === 'Input 123') {
            console.log("✅ DB correctly stored sample_input.");
        } else {
            console.log("❌ DB failed to store sample_input.");
        }

        // 4. Fetch Exam Check (What the frontend gets)
        const fetchedExam = await examService.getExamById(newExamId);
        const fetchedQ = fetchedExam.questions[0];
        console.log("Fetched API Data:", { testIn: fetchedQ.testIn, testOut: fetchedQ.testOut });
        
        if (fetchedQ.testIn === 'Input 123' && fetchedQ.testOut === 'Output 123') {
            console.log("✅ API fetch correctly mapped testIn and testOut.");
            console.log("🎉 TEST PASSED! The frontend will now receive the sample test cases and display them.");
        } else {
            console.log("❌ API fetch failed to map the fields correctly.");
        }

    } catch (err) {
        console.error("Test Error Details:");
        console.error(err.message);
        console.error(err.stack);
    } finally {
        if (newExamId) {
            console.log("Cleaning up test exam...");
            await pool.query("DELETE FROM exams WHERE id = $1", [newExamId]);
        }
        await pool.end();
        process.exit();
    }
}

testSampleIO();
