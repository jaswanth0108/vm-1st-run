const { Client } = require('pg');
const fs = require('fs');

const client = new Client({ 
    connectionString: 'postgres://college_exam_portal_user:T6QeJd2qWtv1pA0zPZfWwX00e70X6G1e@dpg-cv20gbtu0jms739f8f2g-a.oregon-postgres.render.com/college_exam_portal_96c6', 
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000 
});

async function run() { 
    try { 
        await client.connect(); 
        console.log('Connected to Render DB!'); 
        
        const sql = fs.readFileSync('src/config/init.sql', 'utf8');
        await client.query(sql); 
        console.log('All migrations done successfully!'); 
    } catch(e) { 
        console.error('Error:', e); 
    } finally { 
        await client.end(); 
    } 
} 

run();
