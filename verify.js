const http = require('http');

async function testBackend() {
  console.log("Starting backend verification...");

  let cookie = '';
  const request = (path, method = 'GET', body = null) => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 3000,
        path: path,
        method: method,
        headers: {}
      };
      
      if (cookie) {
        options.headers['Cookie'] = cookie;
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
          if (res.headers['set-cookie']) {
            cookie = res.headers['set-cookie'][0];
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: rawData ? JSON.parse(rawData) : null
          });
        });
      });

      req.on('error', (e) => reject(e));
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  };

  try {
    // 1. Mock Login
    let res = await request('/api/login', 'POST');
    console.log("[POST /api/login] Status:", res.status, res.data.message);
    
    // 2. Subscribe
    res = await request('/api/subscribe', 'POST');
    console.log("[POST /api/subscribe] Status:", res.status, res.data.message);

    // 3. Create Dynamic Link
    res = await request('/api/links', 'POST', { target_url: 'https://google.com', original_title: 'Google Link' });
    console.log("[POST /api/links] Status:", res.status);
    const shortId = res.data.link.short_id;
    console.log("   -> Created link with short_id:", shortId);

    // 4. Update Link
    res = await request(`/api/links/${shortId}`, 'PUT', { target_url: 'https://bing.com' });
    console.log(`[PUT /api/links/${shortId}] Status:`, res.status);

    // 5. Fetch Links
    res = await request('/api/links', 'GET');
    console.log("[GET /api/links] Status:", res.status, "Found links:", res.data.links.length);

    // 6. Test Redirect Engine (we just use basic http get)
    const redirectReq = http.request({ hostname: 'localhost', port: 3000, path: `/r/${shortId}` }, (redirectRes) => {
      console.log(`[GET /r/${shortId}] Status:`, redirectRes.statusCode);
      console.log(`   -> Redirected to:`, redirectRes.headers.location);
      
      // 7. Verify Scan Count increment
      setTimeout(async () => {
        const finalRes = await request('/api/links', 'GET');
        const link = finalRes.data.links.find(l => l.short_id === shortId);
        console.log("   -> Final Scan Count:", link.scan_count);
        if (link.scan_count === 1) {
          console.log("✅ Verification Passed!");
        } else {
          console.log("❌ Scan count didn't increment!");
        }
        process.exit(0);
      }, 500);
    });
    redirectReq.end();
  } catch (err) {
    console.error("Verification failed:", err);
    process.exit(1);
  }
}

testBackend();
