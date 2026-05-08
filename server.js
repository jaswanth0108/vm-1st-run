const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { executeCode } = require('./executor');

const app = express();
const port = process.env.PORT || 3000;  // Render sets PORT env var

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

const EXAMS_FILE   = path.join(__dirname, 'exams.json');
const RESULTS_FILE = path.join(__dirname, 'results.json');
const USERS_FILE   = path.join(__dirname, 'users.json');

function ensureFile(filePath, defaultContent) {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, defaultContent);
}

// ─── Wandbox Cloud Compiler ───────────────────────────────────────────────────
// Wandbox (wandbox.org) is a free, open code execution engine — no API key needed.
// Docs: https://github.com/melpon/wandbox/blob/master/kennel2/API.rst
//
// Compiler names use "-head" (latest available version) for maximum compatibility.
// All 18 dropdown languages are mapped below.

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
    kotlin:     { compiler: 'groovy-4.0.23',       options: '' },  // closest JVM lang; Kotlin not on Wandbox
    swift:      { compiler: 'swift-6.0.1',         options: '' },
    scala:      { compiler: 'scala-3.5.1',         options: '' },
    perl:       { compiler: 'perl-5.42.0',         options: '' },
    csharp:     { compiler: 'dotnetcore-8.0.402',  options: '' },
    r:          { compiler: 'r-4.4.1',             options: '' },
    sql:        { compiler: 'dotnetcore-8.0.402',  options: '' },  // SQLite not directly; use dotnet
    other:      { compiler: 'cpython-3.13.8',      options: '' },
};

// Languages installed directly in the Docker container (fast, offline, no external API):
//   javascript → node (built into Node.js base image)
//   python     → python3 (installed via apt in Dockerfile)
//   c          → gcc    (installed via apt in Dockerfile)
//   cpp        → g++    (installed via apt in Dockerfile)
//   java       → javac/java (installed via apt in Dockerfile)
// All other languages route to Wandbox cloud as fallback.
const LOCAL_LANGS = new Set(['javascript', 'python', 'c', 'cpp', 'java']);

// Compiled languages need longer timeouts (compile + run = ~15-30s on Wandbox)
const SLOW_LANGS = new Set(['c', 'cpp', 'java', 'go', 'rust', 'kotlin', 'swift', 'scala', 'csharp', 'typescript']);

/**
 * Wandbox always saves Java code as "prog.java", so the public class MUST be
 * named "prog". This renames the public class (and any matching constructor)
 * so the student's code compiles without changing its logic.
 */
function normalizeJavaCode(code) {
    // Find the public class name
    const match = code.match(/public\s+class\s+(\w+)/);
    if (!match || match[1] === 'prog') return code;
    const origName = match[1];
    // Replace class declaration and constructor references
    return code
        .replace(new RegExp(`\\bpublic\\s+class\\s+${origName}\\b`, 'g'), 'public class prog')
        .replace(new RegExp(`\\b${origName}\\s*\\(`, 'g'), 'prog(');
}

function runViaWandbox(langKey, code, stdin, timeoutMs) {
    return new Promise((resolve) => {
        const cfg = WANDBOX_COMPILER_MAP[langKey] || WANDBOX_COMPILER_MAP['other'];
        const startTime = Date.now();

        // Java: rename public class to 'prog' to match Wandbox's fixed filename
        const finalCode = langKey === 'java' ? normalizeJavaCode(code) : code;

        // Compiled languages need more time (compile + run)
        const networkTimeout = SLOW_LANGS.has(langKey) ? 35000 : 20000;

        const body = JSON.stringify({
            compiler: cfg.compiler,
            code: finalCode,
            stdin:   stdin || '',
            options: cfg.options || '',
            'runtime-option-raw': '',
        });

        const req = https.request(
            {
                hostname: 'wandbox.org',
                path:     '/api/compile.json',
                method:   'POST',
                headers: {
                    'Content-Type':   'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
                timeout: networkTimeout,
            },
            (res) => {
                let data = '';
                res.on('data', chunk => (data += chunk));
                res.on('end', () => {
                    try {
                        const r = JSON.parse(data);

                        // Wandbox API error (unknown compiler, rate limit, etc.)
                        if (!r.status && !r.program_output && !r.compiler_output) {
                            const errMsg = r.error || r.message || JSON.stringify(r).substring(0, 150);
                            return resolve({
                                success: false, output: '',
                                error: `Cloud compiler error: ${errMsg}`,
                                executionTime: Date.now() - startTime,
                            });
                        }

                        const compileErr = (r.compiler_error || '').trim();
                        const compileOut = (r.compiler_output || '').trim();
                        const progOut   = (r.program_output  || '').trim();
                        const progErr   = (r.program_error   || '').trim();
                        const exitCode  = parseInt(r.status || '0', 10);
                        const success   = exitCode === 0 && !compileErr;

                        resolve({
                            success,
                            output:        progOut,
                            error:         compileErr || progErr || '',
                            executionTime: Date.now() - startTime,
                            timedOut:      false,
                        });
                    } catch (e) {
                        resolve({
                            success: false, output: '',
                            error: 'Invalid response from Wandbox. Please try again.',
                            executionTime: Date.now() - startTime,
                        });
                    }
                });
            }
        );

        req.on('error', err => resolve({
            success: false, output: '',
            error: `Cloud compiler unavailable: ${err.message}. Check internet connection.`,
            executionTime: Date.now() - startTime,
        }));

        req.on('timeout', () => {
            req.destroy();
            resolve({
                success: false, output: '',
                error: 'Cloud compiler timed out. Try again or simplify your code.',
                executionTime: Date.now() - startTime,
            });
        });

        req.write(body);
        req.end();
    });
}

// ─── POST /api/compile ───────────────────────────────────────────────────────
app.post('/api/compile', async (req, res) => {
    const startTime = Date.now();
    try {
        const { language, code, input, timeout } = req.body;

        if (!language) return res.status(400).json({ success: false, output: '', error: 'Missing field: "language"', executionTime: 0 });
        if (!code || !code.trim()) return res.status(400).json({ success: false, output: '', error: 'Missing field: "code"', executionTime: 0 });

        // Normalise language key from dropdown value
        const langKey = language.toLowerCase()
            .replace(/\s+/g, '')
            .replace('c++', 'cpp')
            .replace('c#', 'csharp')
            .replace(/[^a-z0-9]/g, '');

        let result;
        if (LOCAL_LANGS.has(langKey)) {
            result = await executeCode(langKey, code, input || '', timeout || 5000);
            if (!result.success && result.error && result.error.includes('not installed')) {
                console.log(`[Compile] Local unavailable for "${langKey}", using Wandbox...`);
                result = await runViaWandbox(langKey, code, input || '', timeout || 5000);
            }
        } else {
            console.log(`[Compile] "${langKey}" → Wandbox cloud`);
            result = await runViaWandbox(langKey, code, input || '', timeout || 5000);
        }

        return res.json({
            success:       result.success,
            output:        result.output        || '',
            error:         result.error         || '',
            executionTime: result.executionTime || (Date.now() - startTime),
            timedOut:      result.timedOut      || false,
            language:      langKey,
        });
    } catch (err) {
        console.error('[Compile] Route error:', err);
        res.status(500).json({ success: false, output: '', error: 'Internal Server Error: ' + err.message });
    }
});

// ─── Exams API ───────────────────────────────────────────────────────────────

app.get('/api/exams', (req, res) => {
    try {
        ensureFile(EXAMS_FILE, '[]');
        res.json(JSON.parse(fs.readFileSync(EXAMS_FILE, 'utf8')));
    } catch (e) { res.status(500).json({ error: 'Failed to read exams' }); }
});

app.post('/api/exams', (req, res) => {
    try {
        ensureFile(EXAMS_FILE, '[]');
        const exam = req.body;
        if (!exam || !exam.id) return res.status(400).json({ error: 'ID required' });
        let exams = JSON.parse(fs.readFileSync(EXAMS_FILE, 'utf8'));
        const idx = exams.findIndex(e => e.id === exam.id);
        if (idx > -1) exams[idx] = exam; else exams.push(exam);
        fs.writeFileSync(EXAMS_FILE, JSON.stringify(exams, null, 2));
        res.json({ success: true, exam });
    } catch (e) { res.status(500).json({ error: 'Failed to save exam' }); }
});

app.delete('/api/exams/:id', (req, res) => {
    try {
        ensureFile(EXAMS_FILE, '[]');
        let exams = JSON.parse(fs.readFileSync(EXAMS_FILE, 'utf8'));
        const len = exams.length;
        exams = exams.filter(e => e.id !== req.params.id);
        if (exams.length === len) return res.status(404).json({ error: 'Exam not found' });
        fs.writeFileSync(EXAMS_FILE, JSON.stringify(exams, null, 2));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to delete exam' }); }
});

// ─── Results API ──────────────────────────────────────────────────────────────

app.get('/api/results', (req, res) => {
    try {
        ensureFile(RESULTS_FILE, '[]');
        res.json(JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')));
    } catch (e) { res.status(500).json({ error: 'Failed to read results' }); }
});

app.post('/api/results', (req, res) => {
    try {
        ensureFile(RESULTS_FILE, '[]');
        const result = req.body;
        if (!result || !result.examId || !result.studentId)
            return res.status(400).json({ error: 'examId and studentId required' });
        let results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
        results.push(result);
        fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to save result' }); }
});

// ─── Users API ───────────────────────────────────────────────────────────────

app.get('/api/users', (req, res) => {
    try {
        ensureFile(USERS_FILE, '{}');
        res.json(JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')));
    } catch (e) { res.status(500).json({ error: 'Failed to read users' }); }
});

app.post('/api/users', (req, res) => {
    try {
        ensureFile(USERS_FILE, '{}');
        const user = req.body;
        if (!user || !user.id) return res.status(400).json({ error: 'ID required' });
        let users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        users[user.id] = user;
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ error: 'Failed to save user' }); }
});

app.post('/api/users/bulk', (req, res) => {
    try {
        ensureFile(USERS_FILE, '{}');
        const newUsers = req.body;
        if (!newUsers || typeof newUsers !== 'object')
            return res.status(400).json({ error: 'Expected object dictionary' });
        let users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        users = { ...users, ...newUsers };
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, count: Object.keys(newUsers).length });
    } catch (e) { res.status(500).json({ error: 'Failed to bulk save users' }); }
});

app.delete('/api/users/:id', (req, res) => {
    try {
        ensureFile(USERS_FILE, '{}');
        let users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        if (!users[req.params.id]) return res.status(404).json({ error: 'User not found' });
        delete users[req.params.id];
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to delete user' }); }
});

// ─── Auth API ────────────────────────────────────────────────────────────────

app.post('/api/login', (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password || !role)
            return res.status(400).json({ error: 'username, password and role are required' });

        if (role === 'admin') {
            if (username === 'admin' && password === 'Vm@cse5') {
                return res.json({ success: true, session: { id: 'admin_01', name: 'Administrator', role: 'admin', timestamp: Date.now() } });
            }
            return res.status(401).json({ error: 'Invalid admin credentials' });
        }

        if (role === 'student') {
            if (username === 'admin' && password === 'Vm@cse5') {
                return res.json({ success: true, session: { id: 'admin_01', name: 'Administrator', role: 'admin', timestamp: Date.now() } });
            }
            ensureFile(USERS_FILE, '{}');
            const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            const student = users[String(username).trim().toUpperCase()];
            if (!student) return res.status(404).json({ error: 'Student ID not found. Contact Admin.' });
            if (String(student.password) !== String(password)) return res.status(401).json({ error: 'Invalid password' });
            return res.json({
                success: true,
                session: {
                    id:        student.id,
                    name:      student.name,
                    role:      'student',
                    branch:    student.branch || 'General',
                    year:      student.year   || '1',
                    batch:     student.batch  || '',
                    timestamp: Date.now()
                }
            });
        }

        return res.status(400).json({ error: 'Invalid role' });
    } catch (e) {
        console.error('[Login] Error:', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(port, () => {
    console.log(`\n✅ Backend server running at http://localhost:${port}`);
    console.log(`   JavaScript → Local Node.js (fast, offline)`);
    console.log(`   C, C++, Java, Python, Go, Rust and 12 others → Wandbox cloud (wandbox.org)\n`);
});
