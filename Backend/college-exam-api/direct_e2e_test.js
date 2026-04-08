/**
 * Simple test: use the examService directly to create and fetch exam
 */
require('dotenv').config();
const examService = require('./src/services/examService');
const pool = require('./src/config/db');

async function run() {
    let newExamId = null;
    try {
        console.log("=== DIRECT SERVICE TEST ===");

        // Simulate what createExam does with testIn/testOut
        const examData = {
            title: "Direct E2E Test - " + Date.now(),
            subject: "Testing",
            branch: ["CSE"],
            batch: ["2024"],
            duration: 60,
            attemptLimit: 1,
            status: "published",
            questions: [
                {
                    type: "coding",
                    text: "Write a function that squares a number.",
                    testIn: "5",
                    testOut: "25",
                    hiddenCases: [{ input: "3", output: "9" }],
                    constraints: ["1 <= N <= 100"]
                }
            ]
        };

        console.log("\n1. Creating exam via examService.createExam...");
        const result = await examService.createExam(null, examData);
        newExamId = result.id;
        console.log("Created exam ID:", newExamId);

        // Check raw DB values
        console.log("\n2. Checking DB raw values...");
        const { rows } = await pool.query(
            "SELECT id, type, sample_input, sample_output, test_cases FROM questions WHERE exam_id = $1",
            [newExamId]
        );
        console.log("DB raw result:", JSON.stringify(rows, null, 2));

        if (rows[0]?.sample_input === "5") {
            console.log("\n✅ DB correctly stored sample_input = '5'");
        } else {
            console.log("\n❌ DB has wrong sample_input:", rows[0]?.sample_input);
        }

        // Check what getExamById returns to the frontend
        console.log("\n3. Fetching via getExamById (what student frontend gets)...");
        const fetchedExam = await examService.getExamById(newExamId);
        const q = fetchedExam.questions[0];
        console.log("Frontend data:", JSON.stringify({ testIn: q.testIn, testOut: q.testOut }, null, 2));

        if (q.testIn === "5" && q.testOut === "25") {
            console.log("\n🎉 FULL SUCCESS! Sample I/O flows correctly from admin → DB → student API!");
        } else {
            console.log("\n❌ STILL FAILING. testIn/testOut are not mapping correctly.");
            console.log("Full question:", JSON.stringify(q, null, 2));
        }

    } catch (e) {
        console.error("Error:", e.message);
        console.error(e.stack);
    } finally {
        if (newExamId) {
            await pool.query("DELETE FROM exams WHERE id = $1", [newExamId]);
            console.log("\nCleanup done.");
        }
        await pool.end();
        process.exit(0);
    }
}

run();
