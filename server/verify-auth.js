const http = require('http');

function request(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 4002,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let result = '';
        res.on('data', (chunk) => { result += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: result });
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  try {
    const email = `localtest${Date.now()}@example.com`;
    const signup = await request('/api/auth/signup', {
      name: 'Local Test User',
      email,
      password: 'password123',
      role: 'user',
    });
    console.log('SIGNUP', signup.status, signup.body);

    const login = await request('/api/auth/login', {
      email,
      password: 'password123',
    });
    console.log('LOGIN', login.status, login.body);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();