const https = require('https');

async function test() {
  const loginPayload = JSON.stringify({username: 'admin', password: 'Vm@cse5', role: 'admin'});
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginPayload) }
  };
  
  const token = await new Promise((resolve) => {
    const req = https.request('https://vm-1st-run.onrender.com/api/auth/login', opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data).data ? JSON.parse(data).data.token : JSON.parse(data).token));
    });
    req.write(loginPayload);
    req.end();
  });

  const getOpts = {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  };

  const req2 = https.request('https://vm-1st-run.onrender.com/api/users', getOpts, res => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
       const u = JSON.parse(data);
       // Print first student user
       const student = (u.data || u).find(user => user.role.toLowerCase() === 'student');
       console.log(JSON.stringify(student, null, 2));
    });
  });
  req2.end();
}
test();
