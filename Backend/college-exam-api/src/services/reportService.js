const pool = require('../config/db');
const compilerService = require('./compilerService');
const CustomError = require('../utils/customError');

const generateReport = async (submissionId) => {

    const { rows: submissions } = await pool.query(
        'SELECT * FROM submissions WHERE id = $1',
        [submissionId]
    );

    if (submissions.length === 0) throw new CustomError('Submission not found', 404);
    const submission = submissions[0];

    const { rows: questions } = await pool.query(
        'SELECT * FROM questions WHERE exam_id = $1',
        [submission.exam_id]
    );

    const { rows: answers } = await pool.query(
        'SELECT * FROM answers WHERE submission_id = $1',
        [submissionId]
    );

    let correct = 0, wrong = 0, unattempted = 0, totalMarks = 0, obtainedMarks = 0;
    const totalQuestions = questions.length;

    for (const q of questions) {

        const questionMaxMarks = 10;
        totalMarks += questionMaxMarks;

        const answer = answers.find(a => a.question_id === q.id);

        if (!answer) {
            unattempted++;
            continue;
        }

        let isCorrect = false;
        let marksAwarded = 0;

        if (q.type === 'mcq' || q.type === 'MCQ') {
            isCorrect = (answer.student_answer == q.correct_answer);
            marksAwarded = isCorrect ? 10 : 0;
        } 
        else if (q.type === 'coding' || q.type === 'Coding') {
            // Frontend already evaluates 2, 5, 10 marks using correct languages via /api/compile
            // and saves it directly to marks_awarded during submitExam.
            marksAwarded = answer.marks_awarded || 0;
            // Cap at 10 just in case
            if (marksAwarded > 10) marksAwarded = 10;
            isCorrect = (marksAwarded === 10);
        }
        else {
            marksAwarded = answer.marks_awarded || 10;
            if (marksAwarded > 10) marksAwarded = 10;
            isCorrect = marksAwarded > 0;
        }

        await pool.query(
            'UPDATE answers SET is_correct = $1, marks_awarded = $2 WHERE id = $3',
            [isCorrect, marksAwarded, answer.id]
        );

        if (marksAwarded === questionMaxMarks) {
            correct++;
            obtainedMarks += marksAwarded;
        } else if (marksAwarded > 0) {
            // Partial score (e.g. 2 or 5 for coding)
            wrong++; 
            obtainedMarks += marksAwarded;
        } else {
            wrong++;
        }
    }

    const attempted = correct + wrong;
    const percentage = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;
    const status = percentage >= 40 ? 'Pass' : 'Fail';

    const result = await pool.query(
        `INSERT INTO reports
        (submission_id, student_id, exam_id, total_questions, attempted, correct, wrong, unattempted, total_marks, obtained_marks, percentage, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (submission_id) DO UPDATE SET
            total_questions = EXCLUDED.total_questions,
            attempted = EXCLUDED.attempted,
            correct = EXCLUDED.correct,
            wrong = EXCLUDED.wrong,
            unattempted = EXCLUDED.unattempted,
            total_marks = EXCLUDED.total_marks,
            obtained_marks = EXCLUDED.obtained_marks,
            percentage = EXCLUDED.percentage,
            status = EXCLUDED.status,
            generated_at = CURRENT_TIMESTAMP
        RETURNING id`,
        [
            submissionId,
            submission.student_id,
            submission.exam_id,
            totalQuestions,
            attempted,
            correct,
            wrong,
            unattempted,
            totalMarks,
            obtainedMarks,
            percentage,
            status
        ]
    );

    return {
        message: 'Report generated successfully',
        reportId: result.rows[0].id
    };
};

const getStudentReport = async (studentId, examId) => {

    const { rows: reports } = await pool.query(
        `SELECT r.*, u.name as student_name, u.username, u.branch, u.year, u.batch, u.section 
         FROM reports r
         JOIN users u ON r.student_id = u.id
         WHERE r.student_id = $1 AND r.exam_id = $2`,
        [studentId, examId]
    );

    if (reports.length === 0) throw new CustomError('Report not found', 404);

    const report = reports[0];

    // Fetch per-question answers using the submission_id stored in the report
    const { rows: answerRows } = await pool.query(
        `SELECT question_id, student_answer, marks_awarded, time_taken
         FROM answers
         WHERE submission_id = $1`,
        [report.submission_id]
    );

    // Build the three maps the frontend report.html expects
    const answers = {};
    const questionScores = {};
    const questionTimeData = {};

    for (const row of answerRows) {
        const qId = String(row.question_id);
        answers[qId] = row.student_answer;
        questionScores[qId] = row.marks_awarded || 0;
        questionTimeData[qId] = row.time_taken || 0;
    }

    return {
        ...report,
        answers,
        questionScores,
        questionTimeData
    };
};

const getClassResults = async (examId) => {

    const { rows: reports } = await pool.query(
        `SELECT r.*, u.name as student_name, u.username
         FROM reports r
         JOIN users u ON r.student_id = u.id
         WHERE r.exam_id = $1
         ORDER BY r.obtained_marks DESC`,
        [examId]
    );

    const { rows: stats } = await pool.query(
        `SELECT 
            AVG(percentage) as class_average,
            SUM(CASE WHEN status = 'Fail' THEN 1 ELSE 0 END) as total_failed
         FROM reports
         WHERE exam_id = $1`,
        [examId]
    );

    return {
        class_stats: stats[0],
        leaderboard: reports
    };
};

const getAllReports = async (studentId = null) => {
    // JOIN with users to get username and name directly
    let query = `
        SELECT r.*, u.username, u.name as student_name, u.branch, u.year, u.batch, u.section
        FROM reports r
        JOIN users u ON r.student_id = u.id
    `;
    let params = [];
    
    if (studentId) {
        query += ` WHERE r.student_id = $1`;
        params.push(studentId);
    }
    
    const result = await pool.query(query, params);
    
    return result.rows.map(row => ({
        id: row.id,
        examId: row.exam_id,
        studentId: row.student_id,
        username: row.username,
        studentName: row.student_name,
        branch: row.branch,
        year: row.year,
        batch: row.batch,
        section: row.section,
        score: row.percentage,
        totalMarks: row.total_marks,
        percentage: row.percentage,
        submissionId: row.submission_id,
        timestamp: row.generated_at ? new Date(row.generated_at).getTime() : 0
    }));
};

module.exports = {
    generateReport,
    getStudentReport,
    getClassResults,
    getAllReports
};