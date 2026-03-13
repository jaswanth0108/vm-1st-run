const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const CustomError = require('../utils/customError');

const registerUser = async (name, username, password, role, profile = {}) => {
    const { rows } = await pool.execute('SELECT id FROM users WHERE username = $1', [username]);
    if (rows.length > 0) {
        throw new CustomError('Username already registered', 400);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const { branch, year, section, batch } = profile;

    const [result] = await pool.execute(
        'INSERT INTO users (name, username, password_hash, role, branch, year, section, batch) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [name, username, passwordHash, role, branch, year, section, batch]
    );

    return { id: result.id, name, username, role, ...profile };
};

const bulkRegisterUsers = async (users) => {
    const connection = await pool.connect();
    try {
        await connection.query('BEGIN');

        let successCount = 0;
        let skippedCount = 0;

        for (const user of users) {
            const { name, username, password, role, branch, year, section, batch } = user;

            // Check if user exists
            const { rows } = await connection.query('SELECT id FROM users WHERE username = $1', [username]);

            if (rows.length > 0) {
                skippedCount++;
                continue; // Skip duplicates silently during bulk import so others proceed
            }

            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);

            await connection.query(
                'INSERT INTO users (name, username, password_hash, role, branch, year, section, batch) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                [name, username, passwordHash, role, branch, year, section, batch]
            );

            successCount++;
        }

        await connection.query('COMMIT');
        return { successCount, skippedCount, total: users.length };
    } catch (err) {
        await connection.query('ROLLBACK');
        throw err;
    } finally {
        connection.release();
    }
};

const loginUser = async (username, password, role) => {
    // Hardcoded Admin Bypass
    if (username === 'admin' && password === 'admin123') {
        const token = jwt.sign(
            { userId: 'admin_01', role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );
        return {
            user: { id: 'admin_01', name: 'Administrator', username: 'admin', role: 'admin' },
            token
        };
    }

    const [rows] = await pool.execute('SELECT * FROM users WHERE username = $1', [username]);
    if (rows.length === 0) {
        throw new CustomError('Invalid username or password', 401);
    }

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
        throw new CustomError('Invalid username or password', 401);
    }

    const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return {
        user: { 
            id: user.id, 
            name: user.name, 
            username: user.username, 
            role: user.role,
            branch: user.branch,
            year: user.year,
            section: user.section,
            batch: user.batch
        },
        token
    };
};

const getAllUsers = async () => {
    const [rows] = await pool.execute('SELECT id, name, username, role, branch, year, section, batch FROM users ORDER BY name ASC');
    return rows;
};

module.exports = {
    registerUser,
    bulkRegisterUsers,
    loginUser,
    getAllUsers
};
