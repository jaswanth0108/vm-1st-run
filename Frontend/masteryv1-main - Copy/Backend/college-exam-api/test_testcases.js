require('dotenv').config();
const pool = require('./src/config/db');
const examService = require('./src/services/examService');
const reportService = require('./src/services/reportService');

async function runTest() {
    try {
        console.log('--- Test Data Insertion ---');
        // 1. Get a test student
        const { rows: students } = await pool.query("SELECT id FROM users WHERE role='Student' LIMIT 1");
        if (students.length === 0) throw new Error("No students found");
        const studentId = students[0].id;
        
        // 2. Get a test exam and a valid question ID
        const { rows: questions } = await pool.query("SELECT id, exam_id FROM questions WHERE type IN ('Coding', 'coding') LIMIT 1");
        if (questions.length === 0) {
            console.log("No coding questions found to test against. Skipping submission test.");
            const {rows: fakeExam} = await pool.query("SELECT id FROM exams LIMIT 1");
            return;
        }
        
        const questionId = questions[0].id;
        const examId = questions[0].exam_id;
        
        console.log(`Using Student ID: ${studentId}, Exam ID: ${examId}, Question ID: ${questionId}`);

        // 3. Create mock answers with codingTestCaseData
        const answers = { [questionId]: 'console.log("hello test");' };
        const scores = { [questionId]: 10 };
        const timeData = { [questionId]: 45 };
        const codingData = {
            [questionId]: { passed: 4, total: 5 }
        };

        // 4. Submit
        const result = await examService.submitExam(studentId, examId, answers, scores, timeData, codingData);
        console.log('Submission Result:', result);

        // 5. Wait for background report generation
        console.log('Waiting for background report generation...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('\n--- Verification ---');
        // 6. DB check directly
        const { rows: dbCheck } = await pool.query(
            "SELECT test_cases_passed FROM answers WHERE submission_id = $1 AND question_id = $2", 
            [result.submissionId, questionId]
        );
        console.log('Direct DB Check (test_cases_passed):', dbCheck[0]?.test_cases_passed);

        // 7. Test getAllReports
        const reports = await reportService.getAllReports();
        const testReport = reports.find(r => r.submissionId === result.submissionId);
        
        if (testReport) {
            console.log('Report codingTestCaseData:', testReport.codingTestCaseData);
            if (testReport.codingTestCaseData && testReport.codingTestCaseData[questionId]?.passed === 4) {
                console.log('✅ TEST PASSED: codingTestCaseData correctly aggregated and returned');
            } else {
                console.log('❌ TEST FAILED: codingTestCaseData incorrect');
            }
        } else {
            console.log('❌ TEST FAILED: Report not found in getAllReports');
        }

        // Cleanup
        console.log('\nCleaning up mock submission...');
        await pool.query("DELETE FROM submissions WHERE id = $1", [result.submissionId]);
        console.log('Done.');

    } catch (err) {
        console.error('Test Error:', err);
    } finally {
        await pool.end();
        process.exit();
    }
}

runTest();
