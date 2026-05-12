const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/exams',
    method: 'GET'
};

const req = http.request(options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log("Exams:");
        console.log(JSON.parse(data));
    });
});
req.end();
