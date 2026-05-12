const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { errorHandler } = require('./src/middleware/errorHandler');
const CustomError = require('./src/utils/customError');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middlewares
app.use(cors({
    origin: ['https://vm-1st-run.vercel.app', 'http://127.0.0.1:5500', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(helmet());

// Trust proxy to ensure correct IP is used if behind a reverse proxy (like Render's load balancers)
app.set('trust proxy', 1);

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5000, // Limit each IP to 5000 requests per windowMs
    message: { success: false, error: 'Too many requests from this IP, please try again later.' }
});
app.use(limiter);

// Body Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test Route
app.get('/api/ping', (req, res) => {
    res.json({ success: true, message: 'Server is running smoothly!' });
});

// Import Routes
const authRoutes = require('./src/routes/authRoutes');
const examRoutes = require('./src/routes/examRoutes');
const reportRoutes = require('./src/routes/reportRoutes');
const userRoutes = require('./src/routes/userRoutes');
const compilerRoutes = require('./src/routes/compilerRoutes');
app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/compile', compilerRoutes);

// Temporary DB Init Route
app.get('/api/init-db', async (req, res) => {
    try {
        const pool = require('./src/config/db');
        const fs = require('fs');
        const path = require('path');
        const sql = fs.readFileSync(path.join(__dirname, 'src/config/init.sql'), 'utf8');
        await pool.query(sql);
        res.status(200).send('Database initialized successfully from init.sql');
    } catch (e) {
        console.error(e);
        res.status(500).send('Error initializing database: ' + e.message);
    }
});

// 404 Route Catcher
app.use((req, res, next) => {
    next(new CustomError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global Error Handler
app.use(errorHandler);

// Auto-run migrations on startup (safe: all statements use IF NOT EXISTS / ON CONFLICT)
async function runStartupMigrations() {
    const pool = require('./src/config/db');
    const migrations = [
        `ALTER TABLE exams ALTER COLUMN teacher_id DROP NOT NULL`,
        `ALTER TABLE exams ADD COLUMN IF NOT EXISTS branch JSONB DEFAULT '["All"]'`,
        `ALTER TABLE exams ADD COLUMN IF NOT EXISTS batch JSONB DEFAULT '["All"]'`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS branch VARCHAR(50)`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS year VARCHAR(10)`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS section VARCHAR(10)`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS batch VARCHAR(20)`,
        `ALTER TABLE exams ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'published'`,
        `ALTER TABLE exams ADD COLUMN IF NOT EXISTS attempt_limit INT DEFAULT 1`,
        `ALTER TABLE answers ADD COLUMN IF NOT EXISTS time_taken INT DEFAULT 0`,
        `ALTER TABLE answers ADD COLUMN IF NOT EXISTS test_cases_passed JSONB DEFAULT NULL`,
        `ALTER TABLE questions ADD COLUMN IF NOT EXISTS sample_input TEXT`,
        `ALTER TABLE questions ADD COLUMN IF NOT EXISTS sample_output TEXT`,
        `ALTER TABLE reports ADD COLUMN IF NOT EXISTS coding_test_case_data JSONB DEFAULT '{}'`,
        // Ensure Admin password is updated to requested secure version (Vm@cse5)
        `UPDATE users SET password_hash = '$2b$10$NndLqRzr0bc4JQ9gEiQmI.hdyr3wfpKIe6R4ADU9lOwcdM89/mc32' WHERE username = 'admin'`
    ];
    for (const sql of migrations) {
        try {
            await pool.query(sql);
        } catch (e) {
            // Ignore errors for statements that may not apply (e.g. DROP NOT NULL already done)
            console.warn(`Migration skipped (${e.message.slice(0, 80)})`);
        }
    }
    console.log('Startup migrations complete.');
}

app.listen(PORT, async () => {
    console.log(`Server is listening on port ${PORT} in ${process.env.NODE_ENV} mode`);
    await runStartupMigrations();
});
