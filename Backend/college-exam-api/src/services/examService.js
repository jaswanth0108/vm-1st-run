const pool = require('../config/db');
const CustomError = require('../utils/customError');
const reportService = require('./reportService');

const createExam = async (teacherId, examData) => {
    // Admin dashboard sends: title, subject, branch, batch, duration, questions
    const { title, subject, duration, questions, branch, batch } = examData;
    
    // Admin dashboard sends 'admin_01' (string) - Postgres needs NULL for teacher_id
    const resolvedTeacherId = teacherId === 'admin_01' ? null : (Number.isInteger(Number(teacherId)) ? Number(teacherId) : null);
    
    // Map missing backend fields or provide defaults
    const description = subject || 'General Assessment';
    const duration_minutes = parseInt(duration) || 60;

    // Use JSONB format for arrays
    const branchJson = Array.isArray(branch) ? JSON.stringify(branch) : JSON.stringify([branch || 'All']);
    const batchJson = Array.isArray(batch) ? JSON.stringify(batch) : JSON.stringify([batch || 'All']);
    
    // For start/end time, if frontend doesn't provide them, default to now + duration
    const start_time = examData.start_time || new Date();
    const end_time = examData.end_time || new Date(new Date(start_time).getTime() + duration_minutes * 60000);

    if (new Date(start_time) >= new Date(end_time)) {
        throw new CustomError('Start time must be before end time', 400);
    }

    const connection = await pool.connect();
    
    try {
        await connection.query('BEGIN');

        const result = await connection.query(
            `INSERT INTO exams 
            (teacher_id, title, description, branch, batch, start_time, end_time, duration_minutes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            RETURNING id`,
            [resolvedTeacherId, title, description, branchJson, batchJson, start_time, end_time, duration_minutes]
        );

        const examId = result.rows[0].id;

        // If frontend passes questions in the same payload, save them immediately
        if (questions && questions.length > 0) {
            const values = [];
            const placeholders = questions.map((q, i) => {
                const base = i * 7;
                const rawType = (q.type || 'MCQ').toLowerCase();
                let normalizedType = 'MCQ';
                if (rawType.includes('coding')) normalizedType = 'Coding';
                else if (rawType.includes('mcq')) normalizedType = 'MCQ';
                else normalizedType = 'Descriptive'; // handles 'text' or 'descriptive'

                values.push(
                    examId,
                    normalizedType,
                    q.text || q.problem_statement || 'No title',
                    q.options ? JSON.stringify(q.options) : (q.mcq_options ? JSON.stringify(q.mcq_options) : null),
                    q.correct || q.correct_answer || null,
                    q.marks || 1,
                    q.hiddenCases ? JSON.stringify(q.hiddenCases) : (q.test_cases ? JSON.stringify(q.test_cases) : null)
                );
                return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7})`;
            }).join(', ');

            const query = `
                INSERT INTO questions
                (exam_id, type, problem_statement, mcq_options, correct_answer, marks, test_cases)
                VALUES ${placeholders}
            `;
            await connection.query(query, values);
        }

        await connection.query('COMMIT');
        return { id: examId, ...examData };
    } catch (err) {
        await connection.query('ROLLBACK');
        throw err;
    } finally {
        connection.release();
    }
};

const getExams = async () => {

    const { rows } = await pool.query(
        'SELECT * FROM exams ORDER BY start_time DESC'
    );

    return rows;
};

const addQuestions = async (examId, questions) => {

    const { rows: exams } = await pool.query(
        'SELECT id FROM exams WHERE id = $1',
        [examId]
    );

    if (exams.length === 0) {
        throw new CustomError('Exam not found', 404);
    }

    const values = [];

    const placeholders = questions.map((q, i) => {

        const base = i * 7;

        values.push(
            examId,
            q.type,
            q.problem_statement,
            q.mcq_options ? JSON.stringify(q.mcq_options) : null,
            q.correct_answer || null,
            q.marks || 1,
            q.test_cases ? JSON.stringify(q.test_cases) : null
        );

        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7})`;

    }).join(', ');

    const query = `
        INSERT INTO questions
        (exam_id, type, problem_statement, mcq_options, correct_answer, marks, test_cases)
        VALUES ${placeholders}
    `;

    await pool.query(query, values);

    return { message: `${questions.length} questions added successfully.` };
};

const attemptExam = async (studentId, examId) => {

    const { rows: exams } = await pool.query(
        'SELECT * FROM exams WHERE id = $1',
        [examId]
    );

    if (exams.length === 0) {
        throw new CustomError('Exam not found', 404);
    }

    try {

        const result = await pool.query(
            `INSERT INTO submissions (exam_id, student_id)
             VALUES ($1,$2)
             RETURNING id`,
            [examId, studentId]
        );

        const { rows: questions } = await pool.query(
            `SELECT id, type, problem_statement, mcq_options, marks
             FROM questions
             WHERE exam_id = $1`,
            [examId]
        );

        return {
            submissionId: result.rows[0].id,
            exam: exams[0],
            questions
        };

    } catch (err) {

        if (err.code === '23505') {
            throw new CustomError(
                'You have already attempted or submitted this exam',
                400
            );
        }

        throw err;
    }
};

const submitExam = async (studentId, examId, answers) => {

    const connection = await pool.connect();

    try {

        await connection.query('BEGIN');

        const { rows: submissions } = await connection.query(
            `SELECT id
             FROM submissions
             WHERE exam_id = $1
             AND student_id = $2
             AND status = 'InProgress'`,
            [examId, studentId]
        );

        if (submissions.length === 0) {
            throw new CustomError(
                'No active submission found for this exam',
                400
            );
        }

        const submissionId = submissions[0].id;

        if (answers && answers.length > 0) {

            const values = [];

            const placeholders = answers.map((a, i) => {

                const base = i * 3;

                values.push(
                    submissionId,
                    a.question_id,
                    a.student_answer
                );

                return `($${base+1},$${base+2},$${base+3})`;

            }).join(', ');

            const query = `
                INSERT INTO answers
                (submission_id, question_id, student_answer)
                VALUES ${placeholders}
            `;

            await connection.query(query, values);
        }

        await connection.query(
            `UPDATE submissions
             SET status = 'Submitted',
             submitted_at = NOW()
             WHERE id = $1`,
            [submissionId]
        );

        await connection.query('COMMIT');

        // Background report generation
        reportService.generateReport(submissionId)
            .catch(err => {
                console.error(
                    'Background report generation failed:',
                    err.message
                );
            });

        return {
            submissionId,
            message: 'Exam submitted successfully'
        };

    } catch (err) {

        await connection.query('ROLLBACK');
        throw err;

    } finally {

        connection.release();
    }
};

module.exports = {
    createExam,
    getExams,
    addQuestions,
    attemptExam,
    submitExam
};