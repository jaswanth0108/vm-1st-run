/**
 * Verified E2E test that uses a real admin user ID
 */
require('dotenv').config();
const pool = require('./src/config/db');
const examService = require('./src/services/examService');

async function run() {
    let newExamId = null;
    try {
        console.log("=== VERIFIED E2E TEST ===");

        // Get actual admin user id
        const { rows: adminRows } = await pool.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
        const adminId = adminRows[0]?.id;
        console.log("Admin user ID:", adminId);

        const examData = {
            title: "Verified E2E Test - " + Date.now(),
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

        console.log("\n1. Creating exam via examService.createExam with adminId:", adminId);
        const result = await examService.createExam(adminId, examData);
        newExamId = result.id;
        console.log("Created exam ID:", newExamId);

        // Check raw DB
        const { rows } = await pool.query(
            "SELECT id, sample_input, sample_output FROM questions WHERE exam_id = $1",
            [newExamId]
        );
        console.log("\n2. DB raw result:", JSON.stringify(rows));

        // Check getExamById
        const fetchedExam = await examService.getExamById(newExamId);
        const q = fetchedExam.questions[0];
        console.log("\n3. API response for student:", JSON.stringify({ testIn: q.testIn, testOut: q.testOut }));

        if (q.testIn === "5" && q.testOut === "25") {
            console.log("\n🎉 SUCCESS! The full flow works correctly.");
        } else {
            console.log("\n❌ FAIL. testIn/testOut:", q.testIn, q.testOut);
            console.log("Full q:", JSON.stringify(q));
        }

    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        if (newExamId) {
            await pool.query("DELETE FROM exams WHERE id = $1", [newExamId]);
            console.log("\nCleaned up.");
        }
        await pool.end();
        process.exit(0);
    }
}
run();
