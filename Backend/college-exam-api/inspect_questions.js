require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
    try {
        const res = await pool.query("SELECT * FROM questions LIMIT 1");
        console.log("Columns:", Object.keys(res.fields || res.rows[0] || {}));
        const fields = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'questions'");
        console.log("System columns:", fields.rows.map(r => r.column_name));
    } catch(e) {
        console.error(e.message);
    } finally {
        await pool.end();
        process.exit();
    }
}
check();
