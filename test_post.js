const http = require('http');

function createExam(id, title) {
    return new Promise(resolve => {
        const data = JSON.stringify({
            id: id,
            title: title,
            branch: ['All'],
            batch: ['2024-2028'],
            subject: 'Test',
            duration: '60',
            attemptLimit: 1,
            questions: []
        });

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/exams',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = http.request(options, res => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => {
                console.log(`Created ${id}:`, resData);
                resolve();
            });
        });
        req.write(data);
        req.end();
    });
}

function getExams() {
    return new Promise(resolve => {
        const req = http.request({ hostname: 'localhost', port: 3000, path: '/api/exams', method: 'GET' }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve(JSON.parse(data));
            });
        });
        req.end();
    });
}

async function run() {
    await createExam('exam_test1', 'Test Exam 1');
    await createExam('exam_test2', 'Test Exam 2');
    const exams = await getExams();
    console.log("Total exams:", exams.length);
    console.log("Exams titles:", exams.map(e => e.title).join(', '));
}

run();
