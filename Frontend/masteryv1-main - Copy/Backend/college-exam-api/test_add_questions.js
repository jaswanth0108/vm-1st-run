const examService = require('./src/services/examService');
const pool = require('./src/config/db');

async function testAddQuestions() {
    console.log("Testing addQuestions fix...");
    const sampleQuestions = [
        { type: 'coding', text: 'Q1', testIn: '1', testOut: '1' },
        { type: 'coding', text: 'Q2', testIn: '2', testOut: '2' }
    ];
    
    // Test on exam 17 which already exists
    try {
        await pool.query('BEGIN');
        await examService.addQuestions(17, sampleQuestions);
        console.log("Successfully added 2 questions without crashing!");
        await pool.query('ROLLBACK'); // rollback so we don't mess up the exam
    } catch (e) {
        console.log("Failed!", e.message);
        await pool.query('ROLLBACK');
    } finally {
        await pool.end();
        process.exit();
    }
}
testAddQuestions();
