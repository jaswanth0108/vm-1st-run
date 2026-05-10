const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const { executeCode } = require('./executor');

const app  = express();
const port = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

// ─── Storage backend: PostgreSQL (cloud) or JSON files (local dev) ────────────
const USE_PG = !!process.env.DATABASE_URL;
let DB = null;

if (USE_PG) {
    DB = require('./db');
    console.log('[DB] PostgreSQL mode — normalized columns');
} else {
    console.log('[DB] JSON file mode — local development');
}

// JSON file paths (local fallback)
const EXAMS_FILE   = path.join(__dirname, 'exams.json');
const RESULTS_FILE = path.join(__dirname, 'results.json');
const USERS_FILE   = path.join(__dirname, 'users.json');
function ensureFile(f, d) { if (!fs.existsSync(f)) fs.writeFileSync(f, d); }

// JSON helpers
function readJSON(f, def) { ensureFile(f, def); return JSON.parse(fs.readFileSync(f, 'utf8')); }
function writeJSON(f, d) { fs.writeFileSync(f, JSON.stringify(d, null, 2)); }

// ─── Wandbox Cloud Compiler ───────────────────────────────────────────────────
const WANDBOX = {
    c:'{compiler:"gcc-head",options:"-lm"}', // parsed below
};
const WANDBOX_MAP = {
    c:          { compiler:'gcc-head',           options:'-lm' },
    cpp:        { compiler:'gcc-head',           options:'-x c++ -std=c++17 -lm' },
    java:       { compiler:'openjdk-jdk-22+36',  options:'' },
    python:     { compiler:'cpython-3.13.8',     options:'' },
    javascript: { compiler:'nodejs-20.17.0',     options:'' },
    typescript: { compiler:'typescript-5.6.2',   options:'' },
    go:         { compiler:'go-1.23.2',          options:'' },
    rust:       { compiler:'rust-1.82.0',        options:'' },
    ruby:       { compiler:'ruby-3.4.9',         options:'' },
    php:        { compiler:'php-8.3.12',         options:'' },
    kotlin:     { compiler:'groovy-4.0.23',      options:'' },
    swift:      { compiler:'swift-6.0.1',        options:'' },
    scala:      { compiler:'scala-3.5.1',        options:'' },
    perl:       { compiler:'perl-5.42.0',        options:'' },
    csharp:     { compiler:'dotnetcore-8.0.402', options:'' },
    r:          { compiler:'r-4.4.1',            options:'' },
    sql:        { compiler:'dotnetcore-8.0.402', options:'' },
    other:      { compiler:'cpython-3.13.8',     options:'' },
};
const LOCAL_LANGS = new Set(['javascript','python','c','cpp','java']);
const SLOW_LANGS  = new Set(['c','cpp','java','go','rust','kotlin','swift','scala','csharp','typescript']);

function normalizeJava(code) {
    const m = code.match(/public\s+class\s+(\w+)/);
    if (!m || m[1]==='prog') return code;
    return code.replace(new RegExp(`\\bpublic\\s+class\\s+${m[1]}\\b`,'g'),'public class prog')
               .replace(new RegExp(`\\b${m[1]}\\s*\\(`,'g'),'prog(');
}

function runWandbox(langKey, code, stdin) {
    return new Promise(resolve => {
        const cfg = WANDBOX_MAP[langKey] || WANDBOX_MAP.other;
        const t0  = Date.now();
        const src = langKey==='java' ? normalizeJava(code) : code;
        const body = JSON.stringify({ compiler:cfg.compiler, code:src,
            stdin:stdin||'', options:cfg.options||'', 'runtime-option-raw':'' });
        const to = SLOW_LANGS.has(langKey) ? 35000 : 20000;
        const req = https.request(
            { hostname:'wandbox.org', path:'/api/compile.json', method:'POST',
              headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},
              timeout:to },
            res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{
                try {
                    const r=JSON.parse(d);
                    if (!r.status && !r.program_output && !r.compiler_output)
                        return resolve({success:false,output:'',error:r.error||'Cloud compiler error',executionTime:Date.now()-t0});
                    const ok=parseInt(r.status||'0')===0 && !(r.compiler_error||'').trim();
                    resolve({success:ok,output:(r.program_output||'').trim(),
                        error:(r.compiler_error||r.program_error||'').trim(),executionTime:Date.now()-t0});
                } catch(e){ resolve({success:false,output:'',error:'Invalid Wandbox response',executionTime:Date.now()-t0}); }
            }); }
        );
        req.on('error',e=>resolve({success:false,output:'',error:'Cloud unavailable: '+e.message,executionTime:Date.now()-t0}));
        req.on('timeout',()=>{req.destroy();resolve({success:false,output:'',error:'Cloud timed out',executionTime:Date.now()-t0});});
        req.write(body); req.end();
    });
}

// ─── POST /api/compile ────────────────────────────────────────────────────────
app.post('/api/compile', async (req,res) => {
    const t0 = Date.now();
    try {
        const { language, code, input, timeout } = req.body;
        if (!language || !code?.trim())
            return res.status(400).json({success:false,output:'',error:'Missing language or code'});
        const lk = language.toLowerCase().replace(/\s+/g,'').replace('c++','cpp').replace('c#','csharp').replace(/[^a-z0-9]/g,'');
        let result;
        if (LOCAL_LANGS.has(lk)) {
            result = await executeCode(lk, code, input||'', timeout||5000);
            if (!result.success && result.error?.includes('not installed'))
                result = await runWandbox(lk, code, input||'');
        } else {
            result = await runWandbox(lk, code, input||'');
        }
        res.json({success:result.success,output:result.output||'',error:result.error||'',
            executionTime:result.executionTime||(Date.now()-t0),timedOut:result.timedOut||false,language:lk});
    } catch(e){ res.status(500).json({success:false,output:'',error:'Server error: '+e.message}); }
});

// ─── GET /api/exams ───────────────────────────────────────────────────────────
app.get('/api/exams', async (req,res) => {
    try {
        if (USE_PG) return res.json(await DB.getExams());
        res.json(readJSON(EXAMS_FILE,'[]'));
    } catch(e){ res.status(500).json({error:e.message}); }
});

// ─── POST /api/exams ──────────────────────────────────────────────────────────
app.post('/api/exams', async (req,res) => {
    try {
        const exam = req.body;
        if (!exam?.id) return res.status(400).json({error:'id required'});
        if (USE_PG) { await DB.saveExam(exam); return res.json({success:true,exam}); }
        let exams = readJSON(EXAMS_FILE,'[]');
        const i = exams.findIndex(e=>e.id===exam.id);
        if (i>-1) exams[i]=exam; else exams.push(exam);
        writeJSON(EXAMS_FILE, exams);
        res.json({success:true,exam});
    } catch(e){ res.status(500).json({error:e.message}); }
});

// ─── DELETE /api/exams/:id ────────────────────────────────────────────────────
app.delete('/api/exams/:id', async (req,res) => {
    try {
        if (USE_PG) {
            const ok = await DB.deleteExam(req.params.id);
            return ok ? res.json({success:true}) : res.status(404).json({error:'Not found'});
        }
        let exams = readJSON(EXAMS_FILE,'[]');
        const n = exams.length;
        exams = exams.filter(e=>e.id!==req.params.id);
        if (exams.length===n) return res.status(404).json({error:'Not found'});
        writeJSON(EXAMS_FILE, exams);
        res.json({success:true});
    } catch(e){ res.status(500).json({error:e.message}); }
});

// ─── GET /api/results ─────────────────────────────────────────────────────────
app.get('/api/results', async (req,res) => {
    try {
        if (USE_PG) return res.json(await DB.getResults());
        res.json(readJSON(RESULTS_FILE,'[]'));
    } catch(e){ res.status(500).json({error:e.message}); }
});

// ─── POST /api/results ────────────────────────────────────────────────────────
app.post('/api/results', async (req,res) => {
    try {
        const result = req.body;
        if (!result?.examId || !result?.studentId)
            return res.status(400).json({error:'examId and studentId required'});
        if (USE_PG) { await DB.saveResult(result); return res.json({success:true}); }
        let results = readJSON(RESULTS_FILE,'[]');
        results.push(result);
        writeJSON(RESULTS_FILE, results);
        res.json({success:true});
    } catch(e){ res.status(500).json({error:e.message}); }
});

// ─── GET /api/users ───────────────────────────────────────────────────────────
app.get('/api/users', async (req,res) => {
    try {
        if (USE_PG) return res.json(await DB.getUsers());
        res.json(readJSON(USERS_FILE,'{}'));
    } catch(e){ res.status(500).json({error:e.message}); }
});

// ─── POST /api/users ──────────────────────────────────────────────────────────
app.post('/api/users', async (req,res) => {
    try {
        const user = req.body;
        if (!user?.id) return res.status(400).json({error:'id required'});
        if (USE_PG) { await DB.saveUser(user); return res.json({success:true,user}); }
        let users = readJSON(USERS_FILE,'{}');
        users[user.id] = user;
        writeJSON(USERS_FILE, users);
        res.json({success:true,user});
    } catch(e){ res.status(500).json({error:e.message}); }
});

// ─── POST /api/users/bulk ─────────────────────────────────────────────────────
app.post('/api/users/bulk', async (req,res) => {
    try {
        const bulk = req.body;
        if (!bulk || typeof bulk!=='object') return res.status(400).json({error:'Expected object'});
        if (USE_PG) { await DB.bulkSaveUsers(bulk); return res.json({success:true,count:Object.keys(bulk).length}); }
        let users = readJSON(USERS_FILE,'{}');
        Object.assign(users, bulk);
        writeJSON(USERS_FILE, users);
        res.json({success:true,count:Object.keys(bulk).length});
    } catch(e){ res.status(500).json({error:e.message}); }
});

// ─── DELETE /api/users/:id ────────────────────────────────────────────────────
app.delete('/api/users/:id', async (req,res) => {
    try {
        if (USE_PG) {
            const ok = await DB.deleteUser(req.params.id);
            return ok ? res.json({success:true}) : res.status(404).json({error:'Not found'});
        }
        let users = readJSON(USERS_FILE,'{}');
        if (!users[req.params.id]) return res.status(404).json({error:'Not found'});
        delete users[req.params.id];
        writeJSON(USERS_FILE, users);
        res.json({success:true});
    } catch(e){ res.status(500).json({error:e.message}); }
});

// ─── POST /api/login ──────────────────────────────────────────────────────────
app.post('/api/login', async (req,res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password || !role)
            return res.status(400).json({error:'username, password and role required'});

        if (role==='admin') {
            if (username==='admin' && password==='Vm@cse5')
                return res.json({success:true,session:{id:'admin_01',name:'Administrator',role:'admin',timestamp:Date.now()}});
            return res.status(401).json({error:'Invalid admin credentials'});
        }

        if (role==='student') {
            if (username==='admin' && password==='Vm@cse5')
                return res.json({success:true,session:{id:'admin_01',name:'Administrator',role:'admin',timestamp:Date.now()}});

            const sid = String(username).trim().toUpperCase();
            let student = null;
            if (USE_PG) {
                student = await DB.getUserById(sid);
            } else {
                const users = readJSON(USERS_FILE,'{}');
                student = users[sid] || null;
            }
            if (!student) return res.status(404).json({error:'Student ID not found. Contact Admin.'});
            if (String(student.password) !== String(password))
                return res.status(401).json({error:'Invalid password'});
            return res.json({success:true,session:{id:student.id,name:student.name,role:'student',
                branch:student.branch||'',year:student.year||'',batch:student.batch||'',
                section:student.section||'',timestamp:Date.now()}});
        }
        res.status(400).json({error:'Invalid role'});
    } catch(e){ res.status(500).json({error:'Login error: '+e.message}); }
});

// ─── GET /api/db-status (diagnostics) ────────────────────────────────────────
app.get('/api/db-status', async (req, res) => {
    try {
        const status = {
            mode: USE_PG ? 'PostgreSQL' : 'JSON files',
            DATABASE_URL_set: !!process.env.DATABASE_URL,
            tables: {},
            json_files: {}
        };
        ['users.json','exams.json','results.json'].forEach(f => {
            const fp = path.join(__dirname, f);
            if (fs.existsSync(fp)) {
                const d = JSON.parse(fs.readFileSync(fp, 'utf8'));
                status.json_files[f] = Array.isArray(d) ? d.length : Object.keys(d).length;
            } else {
                status.json_files[f] = 'NOT FOUND';
            }
        });
        if (USE_PG) {
            const { Pool } = require('pg');
            const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
            for (const t of ['users','exams','questions','options','hidden_cases','question_constraints','results','answers']) {
                try {
                    const r = await p.query(`SELECT COUNT(*) FROM ${t}`);
                    status.tables[t] = parseInt(r.rows[0].count);
                } catch(e) { status.tables[t] = 'ERROR: ' + e.message; }
            }
            await p.end();
        }
        res.json(status);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/db-force-migrate ───────────────────────────────────────────────
app.post('/api/db-force-migrate', async (req, res) => {
    if (!USE_PG) return res.json({ message: 'Not in PostgreSQL mode' });
    try {
        await DB.initDB();
        res.json({ success: true, message: 'Migration triggered — check Render logs' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(port, async () => {
    console.log(`\n✅ Backend server running at http://localhost:${port}`);
    console.log(`   Storage: ${USE_PG ? 'PostgreSQL (normalized columns)' : 'JSON files (local dev)'}`);
    if (USE_PG) await DB.initDB().catch(e => console.error('[DB] Init failed:', e.message));
});
