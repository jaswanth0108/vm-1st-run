/**
 * db.js — Normalized PostgreSQL data layer
 * All tables use individual columns (no JSONB blobs).
 * API functions return the same JSON shapes the frontend already expects.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
});

// ─── Schema ──────────────────────────────────────────────────────────────────
async function initDB() {
    await pool.query(`
        -- Drop old tables that used JSONB blobs (safe on first run)
        DROP TABLE IF EXISTS answers    CASCADE;
        DROP TABLE IF EXISTS submissions CASCADE;
        DROP TABLE IF EXISTS results    CASCADE;
        DROP TABLE IF EXISTS options    CASCADE;
        DROP TABLE IF EXISTS questions  CASCADE;
        DROP TABLE IF EXISTS exams      CASCADE;
        DROP TABLE IF EXISTS users      CASCADE;

        -- USERS: one column per field
        CREATE TABLE users (
            id         TEXT PRIMARY KEY,
            name       TEXT    NOT NULL DEFAULT '',
            password   TEXT    NOT NULL DEFAULT '',
            branch     TEXT    DEFAULT '',
            year       TEXT    DEFAULT '',
            batch      TEXT    DEFAULT '',
            section    TEXT    DEFAULT '',
            email      TEXT    DEFAULT '',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- EXAMS: one column per field
        CREATE TABLE exams (
            id            TEXT PRIMARY KEY,
            title         TEXT    NOT NULL DEFAULT '',
            subject       TEXT    DEFAULT '',
            year          TEXT    DEFAULT '',
            branch        TEXT    DEFAULT '',
            batch         TEXT    DEFAULT '',
            duration      INTEGER DEFAULT 60,
            attempt_limit INTEGER DEFAULT 1,
            passing_score INTEGER DEFAULT 0,
            status        TEXT    DEFAULT 'draft',
            created_at    TIMESTAMPTZ DEFAULT NOW()
        );

        -- QUESTIONS: one row per question
        CREATE TABLE questions (
            id          TEXT PRIMARY KEY,
            exam_id     TEXT    NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
            type        TEXT    NOT NULL DEFAULT 'mcq',
            text        TEXT    NOT NULL DEFAULT '',
            correct_ans TEXT    DEFAULT '',
            marks       INTEGER DEFAULT 1,
            order_num   INTEGER DEFAULT 0
        );

        -- OPTIONS: one row per MCQ choice
        CREATE TABLE options (
            id           SERIAL  PRIMARY KEY,
            question_id  TEXT    NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
            option_index INTEGER NOT NULL,
            option_text  TEXT    NOT NULL DEFAULT ''
        );

        -- RESULTS: one row per student submission
        CREATE TABLE results (
            id           SERIAL PRIMARY KEY,
            exam_id      TEXT REFERENCES exams(id),
            student_id   TEXT REFERENCES users(id),
            score        INTEGER       DEFAULT 0,
            total_marks  INTEGER       DEFAULT 0,
            percentage   DECIMAL(5,2)  DEFAULT 0,
            warnings     INTEGER       DEFAULT 0,
            submitted_at TIMESTAMPTZ   DEFAULT NOW()
        );

        -- ANSWERS: one row per question answered
        CREATE TABLE answers (
            id            SERIAL  PRIMARY KEY,
            result_id     INTEGER NOT NULL REFERENCES results(id) ON DELETE CASCADE,
            question_id   TEXT    REFERENCES questions(id),
            student_ans   TEXT    DEFAULT '',
            marks_awarded INTEGER DEFAULT 0,
            is_correct    BOOLEAN DEFAULT FALSE
        );
    `);
    console.log('[DB] All 6 tables created with normalized columns');
    await migrateFromJSON();
}

// ─── Migration from JSON files ────────────────────────────────────────────────
async function migrateFromJSON() {
    const usersFile   = path.join(__dirname, 'users.json');
    const examsFile   = path.join(__dirname, 'exams.json');
    const resultsFile = path.join(__dirname, 'results.json');

    // Users
    if (fs.existsSync(usersFile)) {
        const raw = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        for (const [id, u] of Object.entries(raw)) {
            await pool.query(
                `INSERT INTO users(id,name,password,branch,year,batch,section,email)
                 VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING`,
                [id, u.name||'', u.password||'', u.branch||'', u.year||'',
                 u.batch||'', u.section||'', u.email||'']
            ).catch(()=>{});
        }
        console.log(`[DB] Migrated ${Object.keys(raw).length} users`);
    }

    // Exams + questions + options
    if (fs.existsSync(examsFile)) {
        const exams = JSON.parse(fs.readFileSync(examsFile, 'utf8'));
        for (const e of exams) {
            await saveExam(e).catch(()=>{});
        }
        console.log(`[DB] Migrated ${exams.length} exams`);
    }

    // Results + answers
    if (fs.existsSync(resultsFile)) {
        const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
        for (const r of results) {
            await saveResult(r).catch(()=>{});
        }
        console.log(`[DB] Migrated ${results.length} results`);
    }
}

// ─── Users ────────────────────────────────────────────────────────────────────
async function getUsers() {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY id');
    const out = {};
    for (const r of rows) {
        out[r.id] = { id:r.id, name:r.name, password:r.password, branch:r.branch,
                      year:r.year, batch:r.batch, section:r.section, email:r.email };
    }
    return out;
}

async function saveUser(u) {
    await pool.query(
        `INSERT INTO users(id,name,password,branch,year,batch,section,email)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT(id) DO UPDATE SET
           name=$2,password=$3,branch=$4,year=$5,batch=$6,section=$7,email=$8`,
        [u.id, u.name||'', u.password||'', u.branch||'', u.year||'',
         u.batch||'', u.section||u.Section||'', u.email||'']
    );
}

async function bulkSaveUsers(usersObj) {
    for (const [id, u] of Object.entries(usersObj)) {
        await saveUser({ ...u, id });
    }
}

async function deleteUser(id) {
    const r = await pool.query('DELETE FROM users WHERE id=$1', [id]);
    return r.rowCount > 0;
}

async function getUserById(id) {
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
    if (!rows.length) return null;
    const r = rows[0];
    return { id:r.id, name:r.name, password:r.password, branch:r.branch,
             year:r.year, batch:r.batch, section:r.section, email:r.email };
}

// ─── Exams ────────────────────────────────────────────────────────────────────
async function getExams() {
    const { rows: eRows } = await pool.query('SELECT * FROM exams ORDER BY created_at DESC');
    const { rows: qRows } = await pool.query('SELECT * FROM questions ORDER BY exam_id, order_num');
    const { rows: oRows } = await pool.query('SELECT * FROM options ORDER BY question_id, option_index');

    // Build options lookup: question_id → [text, text, ...]
    const optsByQ = {};
    for (const o of oRows) {
        if (!optsByQ[o.question_id]) optsByQ[o.question_id] = [];
        optsByQ[o.question_id][o.option_index] = o.option_text;
    }

    // Build questions lookup: exam_id → [{...}, ...]
    const qByExam = {};
    for (const q of qRows) {
        if (!qByExam[q.exam_id]) qByExam[q.exam_id] = [];
        qByExam[q.exam_id].push({
            id: q.id, type: q.type, text: q.text,
            correct: q.correct_ans, marks: q.marks,
            options: optsByQ[q.id] || []
        });
    }

    return eRows.map(e => ({
        id: e.id, title: e.title, subject: e.subject,
        year: e.year, branch: e.branch, batch: e.batch,
        duration: e.duration, attemptLimit: e.attempt_limit,
        passingScore: e.passing_score, status: e.status,
        createdAt: e.created_at,
        questions: qByExam[e.id] || []
    }));
}

async function saveExam(exam) {
    await pool.query(
        `INSERT INTO exams(id,title,subject,year,branch,batch,duration,attempt_limit,passing_score,status)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT(id) DO UPDATE SET
           title=$2,subject=$3,year=$4,branch=$5,batch=$6,
           duration=$7,attempt_limit=$8,passing_score=$9,status=$10`,
        [exam.id, exam.title||'', exam.subject||'', exam.year||'',
         exam.branch||'', exam.batch||'', exam.duration||60,
         exam.attemptLimit||1, exam.passingScore||0, exam.status||'draft']
    );
    // Rebuild questions (cascade deletes old options)
    await pool.query('DELETE FROM questions WHERE exam_id=$1', [exam.id]);
    for (let i = 0; i < (exam.questions||[]).length; i++) {
        const q = exam.questions[i];
        await pool.query(
            `INSERT INTO questions(id,exam_id,type,text,correct_ans,marks,order_num)
             VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET
             type=$3,text=$4,correct_ans=$5,marks=$6,order_num=$7`,
            [q.id, exam.id, q.type||'mcq', q.text||'',
             String(q.correct??''), q.marks||1, i]
        );
        for (let j = 0; j < (q.options||[]).length; j++) {
            await pool.query(
                'INSERT INTO options(question_id,option_index,option_text) VALUES($1,$2,$3)',
                [q.id, j, String(q.options[j])]
            );
        }
    }
}

async function deleteExam(id) {
    const r = await pool.query('DELETE FROM exams WHERE id=$1', [id]);
    return r.rowCount > 0;
}

// ─── Results ──────────────────────────────────────────────────────────────────
async function getResults() {
    const { rows: rRows } = await pool.query('SELECT * FROM results ORDER BY id');
    const { rows: aRows } = await pool.query('SELECT * FROM answers ORDER BY result_id');

    const ansByR = {}, scoresByR = {};
    for (const a of aRows) {
        if (!ansByR[a.result_id])   ansByR[a.result_id]   = {};
        if (!scoresByR[a.result_id]) scoresByR[a.result_id] = {};
        ansByR[a.result_id][a.question_id]   = a.student_ans;
        scoresByR[a.result_id][a.question_id] = a.marks_awarded;
    }

    return rRows.map(r => ({
        examId: r.exam_id, studentId: r.student_id,
        score: r.score, totalMarks: r.total_marks,
        percentage: parseFloat(r.percentage||0),
        warnings: r.warnings,
        timestamp: r.submitted_at ? new Date(r.submitted_at).getTime() : Date.now(),
        answers: ansByR[r.id] || {},
        questionScores: scoresByR[r.id] || {}
    }));
}

async function saveResult(result) {
    const pct = result.totalMarks > 0
        ? ((result.score / result.totalMarks) * 100).toFixed(2)
        : (result.percentage || 0);

    const { rows } = await pool.query(
        `INSERT INTO results(exam_id,student_id,score,total_marks,percentage,warnings,submitted_at)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [result.examId, result.studentId, result.score||0,
         result.totalMarks||0, pct, result.warnings||0,
         result.timestamp ? new Date(result.timestamp) : new Date()]
    );
    const rid = rows[0].id;

    const ans    = result.answers       || {};
    const scores = result.questionScores || {};
    for (const [qId, studentAns] of Object.entries(ans)) {
        const awarded = scores[qId] || 0;
        await pool.query(
            `INSERT INTO answers(result_id,question_id,student_ans,marks_awarded,is_correct)
             VALUES($1,$2,$3,$4,$5)`,
            [rid, qId, String(studentAns), awarded, awarded > 0]
        );
    }
}

module.exports = { initDB, getUsers, saveUser, bulkSaveUsers, deleteUser, getUserById,
                   getExams, saveExam, deleteExam, getResults, saveResult };
