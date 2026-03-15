const pool = require('../config/db');
const CustomError = require('../utils/customError');
const reportService = require('./reportService');

const createExam = async (teacherId, examData) => {
    // Admin dashboard sends: title, subject, branch, batch, duration, questions
    const { title, subject, duration, questions, branch, batch, status } = examData;
    
    // Admin dashboard sends 'admin_01' (string) - Postgres needs NULL for teacher_id
    const resolvedTeacherId = teacherId === 'admin_01' ? null : (Number.isInteger(Number(teacherId)) ? Number(teacherId) : null);
    
    // Map missing backend fields or provide defaults
    const description = subject || 'General Assessment';
    const duration_minutes = parseInt(duration) || 60;
    const examStatus = status || 'published';

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
            (teacher_id, title, description, branch, batch, start_time, end_time, duration_minutes, status, attempt_limit)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING id`,
            [resolvedTeacherId, title, description, branchJson, batchJson, start_time, end_time, duration_minutes, examStatus, examData.attemptLimit || examData.attempt_limit || 1]
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
        return { ...examData, id: examId };
    } catch (err) {
        await connection.query('ROLLBACK');
        throw err;
    } finally {
        connection.release();
    }
};

const getExams = async () => {

    const { rows } = await pool.query(`
        SELECT e.*, 
        (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as question_count
        FROM exams e 
        ORDER BY e.created_at DESC
    `);

    // Normalize for frontend expectations (camelCase and mapping)
    return rows.map(row => ({
        id: row.id,           // Keep as integer — frontend must use String() or == for comparison
        title: row.title,
        subject: row.description,
        branch: row.branch,
        batch: row.batch,
        duration: row.duration_minutes,
        status: row.status,
        attemptLimit: row.attempt_limit || 1,
        startTime: row.start_time,
        endTime: row.end_time,
        createdAt: row.created_at,
        questions: { length: parseInt(row.question_count) || 0 }
    }));
};


const getExamById = async (examId) => {
    const { rows: exams } = await pool.query(
        'SELECT * FROM exams WHERE id = $1',
        [examId]
    );

    if (exams.length === 0) {
        throw new CustomError('Exam not found', 404);
    }

    const exam = exams[0];

    // Fetch actual questions
    const { rows: questions } = await pool.query(
        'SELECT * FROM questions WHERE exam_id = $1 ORDER BY id ASC',
        [examId]
    );

    // Normalize questions for frontend (mapping backend fields to frontend expectations)
    const normalizedQuestions = questions.map(q => ({
        id: q.id,
        type: q.type.toLowerCase(),
        text: q.problem_statement,
        problem_statement: q.problem_statement,
        options: q.mcq_options,
        mcq_options: q.mcq_options,
        correct: q.correct_answer,
        correct_answer: q.correct_answer,
        marks: q.marks,
        test_cases: q.test_cases,
        hiddenCases: q.test_cases // Frontend might look for hiddenCases
    }));

    return {
        id: exam.id,
        title: exam.title,
        subject: exam.description,
        description: exam.description,
        branch: exam.branch,
        batch: exam.batch,
        duration: exam.duration_minutes,
        status: exam.status,
        startTime: exam.start_time,
        endTime: exam.end_time,
        createdAt: exam.created_at,
        questions: normalizedQuestions
    };
};

const deleteExam = async (examId) => {
    // Submissions and questions should ideally be deleted via ON DELETE CASCADE
    // But let's be explicit if needed or trust the schema.
    const result = await pool.query('DELETE FROM exams WHERE id = $1', [examId]);
    if (result.rowCount === 0) {
        throw new CustomError('Exam not found', 404);
    }
    return { success: true, message: 'Exam deleted successfully' };
};

const updateExam = async (examId, examData) => {
    const { title, subject, duration, branch, batch, status } = examData;
    const description = subject || 'General Assessment';
    const duration_minutes = parseInt(duration) || 60;
    const attempt_limit = examData.attemptLimit || examData.attempt_limit || 1;
    
    // Safely serialize branch and batch to JSON strings
    const branchJson = Array.isArray(branch) ? JSON.stringify(branch) : JSON.stringify([branch || 'All']);
    const batchJson = Array.isArray(batch) ? JSON.stringify(batch) : JSON.stringify([batch || 'All']);
    
    // Update basic details
    await pool.query(
        `UPDATE exams SET title = $1, description = $2, duration_minutes = $3, branch = $4, batch = $5, status = $6, attempt_limit = $7 WHERE id = $8`,
        [title, description, duration_minutes, branchJson, batchJson, status, attempt_limit, examId]
    );

    // If questions are provided, replace them
    if (examData.questions && Array.isArray(examData.questions)) {
        await pool.query('DELETE FROM questions WHERE exam_id = $1', [examId]);
        await addQuestions(examId, examData.questions);
    }

    return getExamById(examId);
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
        
        // Normalize type to match DB CHECK constraint: 'MCQ', 'Descriptive', 'Coding'
        const rawType = (q.type || 'MCQ').toLowerCase();
        let normalizedType = 'MCQ';
        if (rawType.includes('coding')) normalizedType = 'Coding';
        else if (rawType.includes('mcq')) normalizedType = 'MCQ';
        else normalizedType = 'Descriptive'; // handles 'text', 'descriptive', etc.

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
            `INSERT INTO submissions (exam_id, student_id, status)
             VALUES ($1,$2, 'InProgress')
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

        let submissionId;

        if (submissions.length === 0) {
            // Because frontend skips the /attempt initialization, we auto-create the session here
            const { rows: newSubmissions } = await connection.query(
                `INSERT INTO submissions (exam_id, student_id, status)
                 VALUES ($1, $2, 'InProgress')
                 RETURNING id`,
                [examId, studentId]
            );
            submissionId = newSubmissions[0].id;
        } else {
            // An attempt exists, clear previous answers to overwrite with new attempt
            submissionId = submissions[0].id;
            await connection.query('DELETE FROM answers WHERE submission_id = $1', [submissionId]);
        }

        if (answers && typeof answers === 'object' && Object.keys(answers).length > 0) {

            const values = [];

            const placeholders = Object.keys(answers).map((qId, i) => {

                const base = i * 3;

                values.push(
                    submissionId,
                    parseInt(qId, 10),
                    answers[qId]
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
    getExamById,
    updateExam,
    deleteExam,
    addQuestions,
    attemptExam,
    submitExam
};