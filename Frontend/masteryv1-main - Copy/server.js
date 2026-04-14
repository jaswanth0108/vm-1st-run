const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { executeCode } = require('./executor');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Serve all static HTML/CSS/JS files from the current directory
app.use(express.static(__dirname));

// Path to exams data file
const EXAMS_FILE = path.join(__dirname, 'exams.json');

// Helper to ensure data file exists
function ensureExamsFile() {
    if (!fs.existsSync(EXAMS_FILE)) {
        fs.writeFileSync(EXAMS_FILE, JSON.stringify([]));
    }
}

app.post('/api/compile', async (req, res) => {
    const startTime = Date.now();
    try {
        const { language, code, input, timeout } = req.body;

        if (!language) {
            return res.status(400).json({
                success: false, output: '', error: 'Missing required field: "language"', executionTime: 0
            });
        }
        if (!code || code.trim() === '') {
            return res.status(400).json({
                success: false, output: '', error: 'Missing required field: "code"', executionTime: 0
            });
        }

        const langKey = language.toLowerCase().replace(/[^a-z+]/g, '').replace('c++', 'cpp');
        const result = await executeCode(langKey, code, input || '', timeout || 5000);

        return res.json({
            success: result.success,
            output: result.output || '',
            error: result.error || '',
            executionTime: result.executionTime || (Date.now() - startTime),
            timedOut: result.timedOut || false,
            language: langKey,
        });
    } catch (error) {
        console.error('Error proxying request:', error);
        res.status(500).json({ success: false, output: '', error: 'Internal Server Error' });
    }
});

// --- Exams CRUD API ---

// GET all exams
app.get('/api/exams', (req, res) => {
    try {
        ensureExamsFile();
        const data = fs.readFileSync(EXAMS_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error('Error reading exams:', error);
        res.status(500).json({ error: 'Failed to read exams data' });
    }
});

// POST to save (create or update) an exam
app.post('/api/exams', (req, res) => {
    try {
        ensureExamsFile();
        const exam = req.body;
        if (!exam || !exam.id) {
            return res.status(400).json({ error: 'Invalid exam data. ID is required.' });
        }

        const data = fs.readFileSync(EXAMS_FILE, 'utf8');
        let exams = JSON.parse(data);

        const index = exams.findIndex(e => e.id === exam.id);
        if (index > -1) {
            exams[index] = exam; // Update
        } else {
            exams.push(exam); // Create
        }

        fs.writeFileSync(EXAMS_FILE, JSON.stringify(exams, null, 2));
        res.json({ success: true, exam });
    } catch (error) {
        console.error('Error saving exam:', error);
        res.status(500).json({ error: 'Failed to save exam data' });
    }
});

// DELETE an exam by ID
app.delete('/api/exams/:id', (req, res) => {
    try {
        ensureExamsFile();
        const { id } = req.params;
        const data = fs.readFileSync(EXAMS_FILE, 'utf8');
        let exams = JSON.parse(data);

        const initialLength = exams.length;
        exams = exams.filter(e => e.id !== id);

        if (exams.length === initialLength) {
            return res.status(404).json({ error: 'Exam not found' });
        }

        fs.writeFileSync(EXAMS_FILE, JSON.stringify(exams, null, 2));
        res.json({ success: true, message: 'Exam deleted successfully' });
    } catch (error) {
        console.error('Error deleting exam:', error);
        res.status(500).json({ error: 'Failed to delete exam data' });
    }
});

// --- Results CRUD API ---

const RESULTS_FILE = path.join(__dirname, 'results.json');

function ensureResultsFile() {
    if (!fs.existsSync(RESULTS_FILE)) {
        fs.writeFileSync(RESULTS_FILE, JSON.stringify([]));
    }
}

// GET all results
app.get('/api/results', (req, res) => {
    try {
        ensureResultsFile();
        const data = fs.readFileSync(RESULTS_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error('Error reading results:', error);
        res.status(500).json({ error: 'Failed to read results data' });
    }
});

// POST to save a result
app.post('/api/results', (req, res) => {
    try {
        ensureResultsFile();
        const result = req.body;
        if (!result || !result.examId || !result.studentId) {
            return res.status(400).json({ error: 'Invalid result data. examId and studentId are required.' });
        }

        const data = fs.readFileSync(RESULTS_FILE, 'utf8');
        let results = JSON.parse(data);

        results.push(result);

        fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving result:', error);
        res.status(500).json({ error: 'Failed to save result data' });
    }
});

// --- Users CRUD API ---

const USERS_FILE = path.join(__dirname, 'users.json');

function ensureUsersFile() {
    if (!fs.existsSync(USERS_FILE)) {
        fs.writeFileSync(USERS_FILE, JSON.stringify({}));
    }
}

// GET all users
app.get('/api/users', (req, res) => {
    try {
        ensureUsersFile();
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error('Error reading users:', error);
        res.status(500).json({ error: 'Failed to read users data' });
    }
});

// POST to save (create or update) a single user
app.post('/api/users', (req, res) => {
    try {
        ensureUsersFile();
        const user = req.body;
        if (!user || !user.id) {
            return res.status(400).json({ error: 'Invalid user data. ID is required.' });
        }

        const data = fs.readFileSync(USERS_FILE, 'utf8');
        let users = JSON.parse(data);

        users[user.id] = user;

        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, user });
    } catch (error) {
        console.error('Error saving user:', error);
        res.status(500).json({ error: 'Failed to save user data' });
    }
});

// POST to save (create or update) multiple users in bulk
app.post('/api/users/bulk', (req, res) => {
    try {
        ensureUsersFile();
        const newUsers = req.body; // Expecting a dictionary object
        if (!newUsers || typeof newUsers !== 'object') {
            return res.status(400).json({ error: 'Invalid data. Expected an object dictionary of users.' });
        }

        const data = fs.readFileSync(USERS_FILE, 'utf8');
        let users = JSON.parse(data);

        // Merge the new users into the existing db
        users = { ...users, ...newUsers };

        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, count: Object.keys(newUsers).length });
    } catch (error) {
        console.error('Error saving bulk users:', error);
        res.status(500).json({ error: 'Failed to save bulk user data' });
    }
});

// DELETE a user by ID
app.delete('/api/users/:id', (req, res) => {
    try {
        ensureUsersFile();
        const { id } = req.params;
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        let users = JSON.parse(data);

        if (!users[id]) {
            return res.status(404).json({ error: 'User not found' });
        }

        delete users[id];

        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user data' });
    }
});

// --- Authentication API ---
app.post('/api/login', (req, res) => {
    try {
        const { username, password, role } = req.body;

        if (!username || !password || !role) {
            return res.status(400).json({ error: 'Username, password, and role are required.' });
        }

        if (role === 'admin') {
            if (username === 'admin' && password === 'Vm@cse5') {
                return res.json({
                    success: true,
                    session: {
                        id: 'admin_01',
                        name: 'Administrator',
                        role: 'admin',
                        timestamp: Date.now()
                    }
                });
            } else {
                return res.status(401).json({ error: 'Invalid admin credentials' });
            }
        } else if (role === 'student') {
            // Check if admin is logging in via student portal
            if (username === 'admin' && password === 'Vm@cse5') {
                return res.json({
                    success: true,
                    session: {
                        id: 'admin_01',
                        name: 'Administrator',
                        role: 'admin',
                        timestamp: Date.now()
                    }
                });
            }

            ensureUsersFile();
            const data = fs.readFileSync(USERS_FILE, 'utf8');
            const users = JSON.parse(data);

            const studentIdNorm = String(username).trim().toUpperCase();
            const student = users[studentIdNorm];

            if (student) {
                if (String(student.password) === String(password)) {
                    return res.json({
                        success: true,
                        session: {
                            id: student.id,
                            name: student.name,
                            role: 'student',
                            branch: student.branch || 'General',
                            year: student.year || '1',
                            batch: student.batch || '',
                            timestamp: Date.now()
                        }
                    });
                } else {
                    return res.status(401).json({ error: 'Invalid password' });
                }
            } else {
                return res.status(404).json({ error: 'Student ID not found. Contact Admin.' });
            }
        } else {
            return res.status(400).json({ error: 'Invalid role specified.' });
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ error: 'Internal Server Error during login' });
    }
});

app.listen(port, () => {
    console.log(`Backend server running at http://localhost:${port}`);
});

