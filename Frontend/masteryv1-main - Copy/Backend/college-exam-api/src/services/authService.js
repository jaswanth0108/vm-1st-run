const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const CustomError = require('../utils/customError');

const registerUser = async (name, username, password, role, profile = {}) => {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const { branch, year, section, batch } = profile;

    // Upsert: if username already exists, update their details and password.
    // This prevents duplicate key errors when admin re-adds a student.
    const { rows } = await pool.query(
        `INSERT INTO users (name, username, password_hash, role, branch, year, section, batch)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (username) DO UPDATE
           SET name = EXCLUDED.name,
               password_hash = EXCLUDED.password_hash,
               branch = EXCLUDED.branch,
               year = EXCLUDED.year,
               section = EXCLUDED.section,
               batch = EXCLUDED.batch
         RETURNING id`,
        [name, username, passwordHash, role, branch, year, section, batch]
    );

    return { id: rows[0].id, name, username, role, ...profile };
};

const bulkRegisterUsers = async (users) => {
    const connection = await pool.connect();
    try {
        await connection.query('BEGIN');

        let successCount = 0;
        let updateCount = 0;

        for (const user of users) {
            const { name, username, password, role, branch, year, section, batch } = user;

            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);

            // Upsert: insert new student or update existing one on username conflict.
            const result = await connection.query(
                `INSERT INTO users (name, username, password_hash, role, branch, year, section, batch)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (username) DO UPDATE
                   SET name = EXCLUDED.name,
                       password_hash = EXCLUDED.password_hash,
                       branch = EXCLUDED.branch,
                       year = EXCLUDED.year,
                       section = EXCLUDED.section,
                       batch = EXCLUDED.batch
                 RETURNING (xmax = 0) AS inserted`,
                [name, username, passwordHash, role, branch, year, section, batch]
            );

            // xmax = 0 means a new row was inserted; otherwise it was updated
            if (result.rows[0].inserted) {
                successCount++;
            } else {
                updateCount++;
            }
        }

        await connection.query('COMMIT');
        return { successCount, updateCount, total: users.length };
    } catch (err) {
        await connection.query('ROLLBACK');
        throw err;
    } finally {
        connection.release();
    }
};

const loginUser = async (username, password, role) => {

    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
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
    const { rows } = await pool.query('SELECT id, name, username, role, branch, year, section, batch FROM users ORDER BY name ASC');
    return rows;
};

const updateUser = async (username, userData) => {
    const { name, branch, year, section, batch, password } = userData;

    if (password) {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        await pool.query(
            'UPDATE users SET name = $1, branch = $2, year = $3, section = $4, batch = $5, password_hash = $6 WHERE UPPER(username) = UPPER($7)',
            [name, branch, year, section, batch, passwordHash, username]
        );
    } else {
        await pool.query(
            'UPDATE users SET name = $1, branch = $2, year = $3, section = $4, batch = $5 WHERE UPPER(username) = UPPER($6)',
            [name, branch, year, section, batch, username]
        );
    }

    return { username, name, branch, year, section, batch };
};

const deleteUser = async (identifier) => {
    // Try to delete by username first (rollNo), then fall back to internal id
    let result = await pool.query('DELETE FROM users WHERE UPPER(username) = UPPER($1)', [identifier]);
    if (result.rowCount === 0) {
        // Fallback: try by internal id column (in case frontend passed the internal id)
        result = await pool.query('DELETE FROM users WHERE id = $1', [identifier]);
    }
    if (result.rowCount === 0) {
        throw new CustomError('User not found', 404);
    }
    return { message: 'User deleted successfully' };
};

module.exports = {
    registerUser,
    bulkRegisterUsers,
    loginUser,
    getAllUsers,
    updateUser,
    deleteUser
};
