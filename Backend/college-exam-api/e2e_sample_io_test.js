/**
 * Full End-to-End Test - Simulates EXACTLY what the admin portal does when publishing an exam.
 * Tests the live server's /api/exams endpoint to make sure testIn and testOut are saved.
 */
const http = require('http');
const https = require('https');

const SERVER_URL = 'http://localhost:5000';

// Step 1: Login as admin
async function fetchJSON(url, options = {}) {
    const isHttps = url.startsWith('https');
    const lib = isHttps ? https : http;
    return new Promise((resolve, reject) => {
        const body = options.body ? JSON.stringify(options.body) : undefined;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        const urlObj = new URL(url);
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: body ? { ...headers, 'Content-Length': Buffer.byteLength(body) } : headers
        };
        const req = lib.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function run() {
    console.log("=== FULL E2E TEST: Admin creates exam with sample I/O ===\n");

    // 1. Login
    console.log("1. Logging in as admin...");
    const loginRes = await fetchJSON(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        body: { username: 'admin', password: 'admin123' }
    });

    if (!loginRes.body.token) {
        console.error("❌ Login failed:", JSON.stringify(loginRes.body));
        return;
    }
    const token = loginRes.body.token;
    console.log("✅ Logged in, got token.\n");

    // 2. Create an exam with a coding question containing sample I/O
    // This is exactly what admin/index.html sends via ExamService.saveExam()
    console.log("2. Creating exam via POST /api/exams...");
    const examPayload = {
        title: "E2E Test Exam - Sample IO",
        subject: "Testing",
        branch: ["CSE"],
        batch: ["2024"],
        duration: 60,
        attemptLimit: 1,
        status: "published",
        questions: [
            {
                type: "coding",
                text: "Write a function that returns the square of a number.",
                testIn: "5",
                testOut: "25",
                hiddenCases: [{ input: "3", output: "9" }],
                constraints: ["1 <= N <= 100"]
            }
        ]
    };

    const createRes = await fetchJSON(`${SERVER_URL}/api/exams`, {
        method: 'POST',
        body: examPayload,
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (createRes.status !== 201 || !createRes.body.data?.id) {
        console.error("❌ Exam creation failed. Status:", createRes.status);
        console.error("Response:", JSON.stringify(createRes.body, null, 2));
        return;
    }
    const examId = createRes.body.data.id;
    console.log(`✅ Exam created with ID: ${examId}\n`);

    // 3. Fetch the exam as if a student is starting it
    console.log("3. Fetching exam details via GET /api/exams/:id...");
    const getRes = await fetchJSON(`${SERVER_URL}/api/exams/${examId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (getRes.status !== 200) {
        console.error("❌ Failed to fetch exam:", JSON.stringify(getRes.body));
        return;
    }

    const questions = getRes.body.data?.questions;
    console.log("Questions received by frontend:");
    console.log(JSON.stringify(questions?.map(q => ({ id: q.id, testIn: q.testIn, testOut: q.testOut })), null, 2));

    if (questions?.[0]?.testIn === "5" && questions?.[0]?.testOut === "25") {
        console.log("\n🎉 SUCCESS! testIn and testOut are correctly returned by the API.");
        console.log("The student exam page WILL show the sample test case.");
    } else {
        console.log("\n❌ FAIL! testIn or testOut is missing/wrong in API response.");
        console.log("Full question object:", JSON.stringify(questions?.[0], null, 2));
    }

    // 4. Cleanup
    console.log("\n4. Cleaning up test exam...");
    await fetchJSON(`${SERVER_URL}/api/exams/${examId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log("✅ Test exam deleted.");
}

run().catch(console.error);
