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
app.use(helmet());
app.use(cors());

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

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT} in ${process.env.NODE_ENV} mode`);
});
