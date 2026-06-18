const http = require('http');

async function runSecurityTests() {
  console.log("Starting Security Compliance Tests...\n");
  let cookie = '';
  
  const request = (path, method = 'GET', body = null, overrideCookie = null) => {
    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: 3000,
        path: path,
        method: method,
        headers: {}
      };
      
      const sessionCookie = overrideCookie !== null ? overrideCookie : cookie;
      if (sessionCookie) {
        options.headers['Cookie'] = sessionCookie;
      }

      if (body) {
        const data = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = data.length;
      }

      const req = http.request(options, (res) => {
        let rawData = '';
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          if (res.headers['set-cookie'] && !overrideCookie) {
            cookie = res.headers['set-cookie'][0];
          }
          resolve({ status: res.statusCode, data: rawData ? JSON.parse(rawData) : null });
        });
      });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  };

  try {
    // 1. Setup
    console.log("[Setup] Logging in & Subscribing...");
    await request('/api/login', 'POST');
    await request('/api/subscribe', 'POST');
    
    // 2. Create Base Link
    let res = await request('/api/links', 'POST', { target_url: 'https://valid.com' });
    const shortId = res.data.link.short_id;
    console.log(`[Setup] Created baseline link: ${shortId} (length: ${shortId.length})`);
    if (shortId.length !== 6) throw new Error("short_id length invalid");

    // 3. Test Invalid Protocol (Sanitization)
    console.log("\n[Test 1] Attempt to update with ftp:// (Protocol Enforcement)");
    res = await request(`/api/links/${shortId}`, 'PUT', { target_url: 'ftp://hacker.com' });
    console.log(`Expected 400, Got ${res.status} | Error: ${res.data.error}`);
    if (res.status !== 400) throw new Error("Failed to block invalid protocol");

    // 4. Test Loop Prevention
    console.log("\n[Test 2] Attempt to set target to qrgenplus.com (Loop Prevention)");
    res = await request(`/api/links/${shortId}`, 'PUT', { target_url: 'https://qrgenplus.com/r/loop' });
    console.log(`Expected 400, Got ${res.status} | Error: ${res.data.error}`);
    if (res.status !== 400) throw new Error("Failed to block qrgenplus.com");

    // 5. Test Row-Level Access (Unauthorized Edit)
    console.log("\n[Test 3] Attempt to edit with unauthorized user session (Row-Level Access)");
    res = await request(`/api/links/${shortId}`, 'PUT', { target_url: 'https://hacked.com' }, 'userId=999');
    console.log(`Expected 401/404, Got ${res.status} | Error: ${res.data.error}`);
    if (res.status !== 401 && res.status !== 404) throw new Error("Failed to block unauthorized access");

    console.log("\n✅ All Security Tests Passed Successfully!");
    process.exit(0);

  } catch (err) {
    console.error("\n❌ Security Verification Failed:", err.message);
    process.exit(1);
  }
}

runSecurityTests();
