const https = require('https');

function fetchJSON(url, options = {}) {
    return new Promise((resolve, reject) => {
        const body = options.body ? JSON.stringify(options.body) : undefined;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        const urlObj = new URL(url);
        const reqOptions = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: body ? { ...headers, 'Content-Length': Buffer.byteLength(body) } : headers
        };
        const req = https.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function run() {
    console.log("Testing Render API...");
    const loginResp = await fetchJSON('https://vm-1st-run.onrender.com/api/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: 'admin123' }
    });
    
    if (loginResp.status !== 200) {
        console.log("Login failed", loginResp);
        return;
    }
    
    const loginData = JSON.parse(loginResp.data);
    const token = loginData.token || (loginData.data && loginData.data.token);
    
    console.log("Fetching exam 17...");
    const examResp = await fetchJSON('https://vm-1st-run.onrender.com/api/exams/17', {
        headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log("Exam HTTP Status:", examResp.status);
    
    try {
        const examData = JSON.parse(examResp.data);
        if (examData.data && examData.data.questions) {
            console.log("Q1 shape:", Object.keys(examData.data.questions[0]));
            if(examData.data.questions[0].testIn !== undefined) {
               console.log("We have sample IO mapped!");
            } else {
               console.log("STILL NO testIn. The Render backend has NOT been updated with the fix yet.");
            }
        }
    } catch (e) {
        console.log("Could not parse json");
    }
}

run();
