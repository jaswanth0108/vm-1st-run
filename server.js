const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { executeCode } = require('./executor');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

// ─── JSON file paths (fallback for local dev without DATABASE_URL) ─────────────
const EXAMS_FILE   = path.join(__dirname, 'exams.json');
const RESULTS_FILE = path.join(__dirname, 'results.json');
const USERS_FILE   = path.join(__dirname, 'users.json');

function ensureFile(filePath, def) {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, def);
}

// ─── PostgreSQL Setup ─────────────────────────────────────────────────────────
const USE_PG = !!process.env.DATABASE_URL;
let pool = null;

if (USE_PG) {
    const { Pool } = require('pg');
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }, // Required for Render-hosted PostgreSQL
        max: 10,
        idleTimeoutMillis: 30000,
    });
    console.log('[DB] PostgreSQL mode enabled');
} else {
    console.log('[DB] No DATABASE_URL — using JSON flat-files (local dev mode)');
}

// ─── DB Initialisation: create tables + migrate JSON data ────────────────────
async function initDB() {
    if (!USE_PG) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id   TEXT PRIMARY KEY,
                data JSONB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS exams (
                id         TEXT PRIMARY KEY,
                title      TEXT,
                subject    TEXT,
                year       TEXT,
                branch     TEXT,
                batch      TEXT,
                duration   INTEGER,
                status     TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                data       JSONB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS questions (
                id          TEXT PRIMARY KEY,
                exam_id     TEXT REFERENCES exams(id) ON DELETE CASCADE,
                type        TEXT,
                text        TEXT,
                correct_ans TEXT,
                order_num   INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS options (
                id           SERIAL PRIMARY KEY,
                question_id  TEXT REFERENCES questions(id) ON DELETE CASCADE,
                option_index INTEGER,
                option_text  TEXT
            );
            CREATE TABLE IF NOT EXISTS results (
                id         SERIAL PRIMARY KEY,
                exam_id    TEXT,
                student_id TEXT,
                data       JSONB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS submissions (
                id           SERIAL PRIMARY KEY,
                exam_id      TEXT REFERENCES exams(id),
                student_id   TEXT REFERENCES users(id),
                score        INTEGER DEFAULT 0,
                warnings     INTEGER DEFAULT 0,
                submitted_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS answers (
                id            SERIAL PRIMARY KEY,
                submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
                question_id   TEXT REFERENCES questions(id),
                student_ans   TEXT,
                marks_awarded INTEGER DEFAULT 0
            );
        `);
        console.log('[DB] All 6 tables ready (exams, questions, options, users, results, submissions, answers)');
        await migrateJSON();
    } catch (e) {
        console.error('[DB] Init error:', e.message);
    }
}

// Sync normalized questions+options from an exam object
async function syncExamTables(exam) {
    if (!USE_PG || !exam.questions) return;
    // Upsert exam metadata columns
    await pool.query(`
        UPDATE exams SET title=$2, subject=$3, year=$4, branch=$5, batch=$6,
               duration=$7, status=$8 WHERE id=$1`,
        [exam.id, exam.title||'', exam.subject||'', exam.year||'',
         exam.branch||'', exam.batch||'', exam.duration||60, exam.status||'draft']);
    // Delete old questions (cascade deletes options)
    await pool.query('DELETE FROM questions WHERE exam_id=$1', [exam.id]);
    for (let i = 0; i < exam.questions.length; i++) {
        const q = exam.questions[i];
        await pool.query(
            'INSERT INTO questions(id,exam_id,type,text,correct_ans,order_num) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET type=$3,text=$4,correct_ans=$5,order_num=$6',
            [q.id, exam.id, q.type||'mcq', q.text||'', String(q.correct??''), i]
        );
        if (q.options && Array.isArray(q.options)) {
            for (let j = 0; j < q.options.length; j++) {
                await pool.query(
                    'INSERT INTO options(question_id,option_index,option_text) VALUES($1,$2,$3)',
                    [q.id, j, String(q.options[j])]
                );
            }
        }
    }
}

// Sync normalized submissions+answers from a result object
async function syncResultTables(result) {
    if (!USE_PG) return;
    const sr = await pool.query(
        'INSERT INTO submissions(exam_id,student_id,score,warnings,submitted_at) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [result.examId, result.studentId, result.score||0, result.warnings||0,
         result.timestamp ? new Date(result.timestamp) : new Date()]
    );
    const subId = sr.rows[0].id;
    const ans = result.answers || {};
    const scores = result.questionScores || {};
    for (const [qId, studentAns] of Object.entries(ans)) {
        await pool.query(
            'INSERT INTO answers(submission_id,question_id,student_ans,marks_awarded) VALUES($1,$2,$3,$4)',
            [subId, qId, String(studentAns), scores[qId]||0]
        );
    }
}

async function migrateJSON() {
    // Migrate users
    const uc = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(uc.rows[0].count) === 0 && fs.existsSync(USERS_FILE)) {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        for (const [id, data] of Object.entries(users)) {
            await pool.query(
                'INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
                [id, JSON.stringify(data)]
            );
        }
        console.log(`[DB] Migrated ${Object.keys(users).length} users from JSON`);
    }

    // Migrate exams
    const ec = await pool.query('SELECT COUNT(*) FROM exams');
    if (parseInt(ec.rows[0].count) === 0 && fs.existsSync(EXAMS_FILE)) {
        const exams = JSON.parse(fs.readFileSync(EXAMS_FILE, 'utf8'));
        for (const exam of exams) {
            await pool.query(
                'INSERT INTO exams (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
                [exam.id, JSON.stringify(exam)]
            );
        }
        console.log(`[DB] Migrated ${exams.length} exams from JSON`);
    }

    // Migrate results
    const rc = await pool.query('SELECT COUNT(*) FROM results');
    if (parseInt(rc.rows[0].count) === 0 && fs.existsSync(RESULTS_FILE)) {
        const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
        for (const r of results) {
            await pool.query(
                'INSERT INTO results (exam_id, student_id, data) VALUES ($1, $2, $3)',
                [r.examId, r.studentId, JSON.stringify(r)]
            );
        }
        console.log(`[DB] Migrated ${results.length} results from JSON`);
    }
}

// ─── Wandbox Cloud Compiler ───────────────────────────────────────────────────
const WANDBOX_COMPILER_MAP = {
    c:          { compiler: 'gcc-head',            options: '-lm' },
    cpp:        { compiler: 'gcc-head',            options: '-x c++ -std=c++17 -lm' },
    java:       { compiler: 'openjdk-jdk-22+36',   options: '' },
    python:     { compiler: 'cpython-3.13.8',      options: '' },
    javascript: { compiler: 'nodejs-20.17.0',      options: '' },
    typescript: { compiler: 'typescript-5.6.2',    options: '' },
    go:         { compiler: 'go-1.23.2',           options: '' },
    rust:       { compiler: 'rust-1.82.0',         options: '' },
    ruby:       { compiler: 'ruby-3.4.9',          options: '' },
    php:        { compiler: 'php-8.3.12',          options: '' },
    kotlin:     { compiler: 'groovy-4.0.23',       options: '' },
    swift:      { compiler: 'swift-6.0.1',         options: '' },
    scala:      { compiler: 'scala-3.5.1',         options: '' },
    perl:       { compiler: 'perl-5.42.0',         options: '' },
    csharp:     { compiler: 'dotnetcore-8.0.402',  options: '' },
    r:          { compiler: 'r-4.4.1',             options: '' },
    sql:        { compiler: 'dotnetcore-8.0.402',  options: '' },
    other:      { compiler: 'cpython-3.13.8',      options: '' },
};

const LOCAL_LANGS  = new Set(['javascript', 'python', 'c', 'cpp', 'java']);
const SLOW_LANGS   = new Set(['c', 'cpp', 'java', 'go', 'rust', 'kotlin', 'swift', 'scala', 'csharp', 'typescript']);

function normalizeJavaCode(code) {
    const m = code.match(/public\s+class\s+(\w+)/);
    if (!m || m[1] === 'prog') return code;
    return code
        .replace(new RegExp(`\\bpublic\\s+class\\s+${m[1]}\\b`, 'g'), 'public class prog')
        .replace(new RegExp(`\\b${m[1]}\\s*\\(`, 'g'), 'prog(');
}

function runViaWandbox(langKey, code, stdin, timeoutMs) {
    return new Promise((resolve) => {
        const cfg = WANDBOX_COMPILER_MAP[langKey] || WANDBOX_COMPILER_MAP['other'];
        const startTime = Date.now();
        const finalCode = langKey === 'java' ? normalizeJavaCode(code) : code;
        const networkTimeout = SLOW_LANGS.has(langKey) ? 35000 : 20000;

        const body = JSON.stringify({
            compiler: cfg.compiler, code: finalCode,
            stdin: stdin || '', options: cfg.options || '',
            'runtime-option-raw': '',
        });

        const req = https.request(
            { hostname: 'wandbox.org', path: '/api/compile.json', method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
              timeout: networkTimeout },
            (res) => {
                let data = '';
                res.on('data', c => (data += c));
                res.on('end', () => {
                    try {
                        const r = JSON.parse(data);
                        if (!r.status && !r.program_output && !r.compiler_output) {
                            return resolve({ success: false, output: '',
                                error: `Cloud compiler error: ${r.error || r.message || JSON.stringify(r).substring(0, 150)}`,
                                executionTime: Date.now() - startTime });
                        }
                        const compileErr = (r.compiler_error || '').trim();
                        const success = parseInt(r.status || '0', 10) === 0 && !compileErr;
                        resolve({ success, output: (r.program_output || '').trim(),
                            error: compileErr || (r.program_error || '').trim() || '',
                            executionTime: Date.now() - startTime, timedOut: false });
                    } catch (e) {
                        resolve({ success: false, output: '',
                            error: 'Invalid response from Wandbox. Please try again.',
                            executionTime: Date.now() - startTime });
                    }
                });
            }
        );
        req.on('error', err => resolve({ success: false, output: '',
            error: `Cloud compiler unavailable: ${err.message}`, executionTime: Date.now() - startTime }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, output: '',
            error: 'Cloud compiler timed out. Try again.', executionTime: Date.now() - startTime }); });
        req.write(body); req.end();
    });
}

// ─── POST /api/compile ────────────────────────────────────────────────────────
app.post('/api/compile', async (req, res) => {
    const startTime = Date.now();
    try {
        const { language, code, input, timeout } = req.body;
        if (!language) return res.status(400).json({ success: false, output: '', error: 'Missing field: language', executionTime: 0 });
        if (!code || !code.trim()) return res.status(400).json({ success: false, output: '', error: 'Missing field: code', executionTime: 0 });

        const langKey = language.toLowerCase().replace(/\s+/g, '').replace('c++', 'cpp').replace('c#', 'csharp').replace(/[^a-z0-9]/g, '');

        let result;
        if (LOCAL_LANGS.has(langKey)) {
            result = await executeCode(langKey, code, input || '', timeout || 5000);
            if (!result.success && result.error && result.error.includes('not installed')) {
                result = await runViaWandbox(langKey, code, input || '', timeout || 5000);
            }
        } else {
            result = await runViaWandbox(langKey, code, input || '', timeout || 5000);
        }

        return res.json({ success: result.success, output: result.output || '',
            error: result.error || '', executionTime: result.executionTime || (Date.now() - startTime),
            timedOut: result.timedOut || false, language: langKey });
    } catch (err) {
        console.error('[Compile] Error:', err);
        res.status(500).json({ success: false, output: '', error: 'Internal Server Error: ' + err.message });
    }
});

// ─── Exams API ────────────────────────────────────────────────────────────────
app.get('/api/exams', async (req, res) => {
    try {
        if (USE_PG) {
            const { rows } = await pool.query('SELECT data FROM exams');
            return res.json(rows.map(r => r.data));
        }
        ensureFile(EXAMS_FILE, '[]');
        res.json(JSON.parse(fs.readFileSync(EXAMS_FILE, 'utf8')));
    } catch (e) { res.status(500).json({ error: 'Failed to read exams: ' + e.message }); }
});

app.post('/api/exams', async (req, res) => {
    try {
        const exam = req.body;
        if (!exam || !exam.id) return res.status(400).json({ error: 'ID required' });

        if (USE_PG) {
            await pool.query(
                'INSERT INTO exams (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
                [exam.id, JSON.stringify(exam)]
            );
            await syncExamTables(exam).catch(e => console.error('[DB] syncExamTables:', e.message));
            return res.json({ success: true, exam });
        }
        ensureFile(EXAMS_FILE, '[]');
        let exams = JSON.parse(fs.readFileSync(EXAMS_FILE, 'utf8'));
        const idx = exams.findIndex(e => e.id === exam.id);
        if (idx > -1) exams[idx] = exam; else exams.push(exam);
        fs.writeFileSync(EXAMS_FILE, JSON.stringify(exams, null, 2));
        res.json({ success: true, exam });
    } catch (e) { res.status(500).json({ error: 'Failed to save exam: ' + e.message }); }
});

app.delete('/api/exams/:id', async (req, res) => {
    try {
        if (USE_PG) {
            const r = await pool.query('DELETE FROM exams WHERE id = $1', [req.params.id]);
            if (r.rowCount === 0) return res.status(404).json({ error: 'Exam not found' });
            return res.json({ success: true });
        }
        ensureFile(EXAMS_FILE, '[]');
        let exams = JSON.parse(fs.readFileSync(EXAMS_FILE, 'utf8'));
        const len = exams.length;
        exams = exams.filter(e => e.id !== req.params.id);
        if (exams.length === len) return res.status(404).json({ error: 'Exam not found' });
        fs.writeFileSync(EXAMS_FILE, JSON.stringify(exams, null, 2));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to delete exam: ' + e.message }); }
});

// ─── Results API ──────────────────────────────────────────────────────────────
app.get('/api/results', async (req, res) => {
    try {
        if (USE_PG) {
            const { rows } = await pool.query('SELECT data FROM results ORDER BY id');
            return res.json(rows.map(r => r.data));
        }
        ensureFile(RESULTS_FILE, '[]');
        res.json(JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')));
    } catch (e) { res.status(500).json({ error: 'Failed to read results: ' + e.message }); }
});

app.post('/api/results', async (req, res) => {
    try {
        const result = req.body;
        if (!result || !result.examId || !result.studentId)
            return res.status(400).json({ error: 'examId and studentId required' });

        if (USE_PG) {
            await pool.query(
                'INSERT INTO results (exam_id, student_id, data) VALUES ($1, $2, $3)',
                [result.examId, result.studentId, JSON.stringify(result)]
            );
            await syncResultTables(result).catch(e => console.error('[DB] syncResultTables:', e.message));
            return res.json({ success: true });
        }
        ensureFile(RESULTS_FILE, '[]');
        let results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
        results.push(result);
        fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to save result: ' + e.message }); }
});

// ─── Users API ────────────────────────────────────────────────────────────────
app.get('/api/users', async (req, res) => {
    try {
        if (USE_PG) {
            const { rows } = await pool.query('SELECT id, data FROM users');
            const out = {};
            rows.forEach(r => { out[r.id] = r.data; });
            return res.json(out);
        }
        ensureFile(USERS_FILE, '{}');
        res.json(JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')));
    } catch (e) { res.status(500).json({ error: 'Failed to read users: ' + e.message }); }
});

app.post('/api/users', async (req, res) => {
    try {
        const user = req.body;
        if (!user || !user.id) return res.status(400).json({ error: 'ID required' });

        if (USE_PG) {
            await pool.query(
                'INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
                [user.id, JSON.stringify(user)]
            );
            return res.json({ success: true, user });
        }
        ensureFile(USERS_FILE, '{}');
        let users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        users[user.id] = user;
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ error: 'Failed to save user: ' + e.message }); }
});

app.post('/api/users/bulk', async (req, res) => {
    try {
        const newUsers = req.body;
        if (!newUsers || typeof newUsers !== 'object')
            return res.status(400).json({ error: 'Expected object dictionary' });

        if (USE_PG) {
            for (const [id, data] of Object.entries(newUsers)) {
                await pool.query(
                    'INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
                    [id, JSON.stringify(data)]
                );
            }
            return res.json({ success: true, count: Object.keys(newUsers).length });
        }
        ensureFile(USERS_FILE, '{}');
        let users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        users = { ...users, ...newUsers };
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, count: Object.keys(newUsers).length });
    } catch (e) { res.status(500).json({ error: 'Failed to bulk save: ' + e.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        if (USE_PG) {
            const r = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
            if (r.rowCount === 0) return res.status(404).json({ error: 'User not found' });
            return res.json({ success: true });
        }
        ensureFile(USERS_FILE, '{}');
        let users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        if (!users[req.params.id]) return res.status(404).json({ error: 'User not found' });
        delete users[req.params.id];
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to delete user: ' + e.message }); }
});

// ─── Auth API ─────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password || !role)
            return res.status(400).json({ error: 'username, password and role are required' });

        if (role === 'admin') {
            if (username === 'admin' && password === 'Vm@cse5')
                return res.json({ success: true, session: { id: 'admin_01', name: 'Administrator', role: 'admin', timestamp: Date.now() } });
            return res.status(401).json({ error: 'Invalid admin credentials' });
        }

        if (role === 'student') {
            // Allow admin to use student portal
            if (username === 'admin' && password === 'Vm@cse5')
                return res.json({ success: true, session: { id: 'admin_01', name: 'Administrator', role: 'admin', timestamp: Date.now() } });

            const studentIdNorm = String(username).trim().toUpperCase();

            let student = null;
            if (USE_PG) {
                const { rows } = await pool.query('SELECT data FROM users WHERE id = $1', [studentIdNorm]);
                if (rows.length > 0) student = rows[0].data;
            } else {
                ensureFile(USERS_FILE, '{}');
                const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
                student = users[studentIdNorm];
            }

            if (!student) return res.status(404).json({ error: 'Student ID not found. Contact Admin.' });
            if (String(student.password) !== String(password)) return res.status(401).json({ error: 'Invalid password' });

            return res.json({
                success: true,
                session: { id: student.id, name: student.name, role: 'student',
                    branch: student.branch || 'General', year: student.year || '1',
                    batch: student.batch || '', timestamp: Date.now() }
            });
        }

        return res.status(400).json({ error: 'Invalid role' });
    } catch (e) {
        console.error('[Login] Error:', e);
        res.status(500).json({ error: 'Internal Server Error during login' });
    }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(port, async () => {
    console.log(`\n✅ Backend server running at http://localhost:${port}`);
    console.log(`   Storage: ${USE_PG ? 'PostgreSQL (persistent)' : 'JSON files (local dev)'}`);
    console.log(`   JavaScript → Local Node.js (fast, offline)`);
    console.log(`   C, C++, Java, Python, Go, Rust and 12 others → Wandbox cloud (wandbox.org)\n`);
    await initDB();
});
