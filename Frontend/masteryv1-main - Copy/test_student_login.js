const https = require('https');

async function test() {
  const loginPayload = JSON.stringify({username: '24L31A05K0', password: 'password', role: 'student'});
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginPayload) }
  };
  
  const req = https.request('https://vm-1st-run.onrender.com/api/auth/login', opts, res => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => console.log(JSON.stringify(JSON.parse(data), null, 2)));
  });
  req.write(loginPayload);
  req.end();
}
test();
