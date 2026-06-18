const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// 1. verifyAuth
code = code.replace(/const verifyAuth = \(req, res, next\) => \{/, 'const verifyAuth = async (req, res, next) => {');
code = code.replace(/const row = db\.prepare\('SELECT id, username, email, subscribed, stripe_customer_id FROM users WHERE id = \?'\)\.get\(decoded\.userId\);/, 'const result = await db.query("SELECT id, username, email, subscribed, stripe_customer_id FROM users WHERE id = $1", [decoded.userId]);\n    const row = result.rows[0];');

// 2. /api/register
code = code.replace(/const existing = db\.prepare\("SELECT \* FROM users WHERE email = \?"\)\.get\(email\);/, 'const existing = (await db.query("SELECT * FROM users WHERE email = $1", [email])).rows[0];');
code = code.replace(/const stmt = db\.prepare\("INSERT INTO users \(username, email, password_hash\) VALUES \(\?, \?, \?\)"\);\n\s*const info = stmt\.run\(username, email, hash\);\n\s*const token = jwt\.sign\(\{ userId: info\.lastInsertRowid \}/, 'const result = await db.query("INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id", [username, email, hash]);\n    const token = jwt.sign({ userId: result.rows[0].id }');

// 3. /api/login
code = code.replace(/const row = db\.prepare\("SELECT \* FROM users WHERE email = \?"\)\.get\(email\);/, 'const row = (await db.query("SELECT * FROM users WHERE email = $1", [email])).rows[0];');

// 4. /api/auth/google
code = code.replace(/let row = db\.prepare\("SELECT \* FROM users WHERE email = \?"\)\.get\(email\);/, 'let row = (await db.query("SELECT * FROM users WHERE email = $1", [email])).rows[0];');
code = code.replace(/const stmt = db\.prepare\("INSERT INTO users \(username, email\) VALUES \(\?, \?\)"\);\n\s*const info = stmt\.run\(username, email\);\n\s*row = \{ id: info\.lastInsertRowid/, 'const result = await db.query("INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id", [username, email]);\n      row = { id: result.rows[0].id');

// 5. /api/links (POST)
code = code.replace(/db\.prepare\(`INSERT INTO links \(short_id, owner_id, original_title, target_url, password, ios_url, android_url\) VALUES \(\?, \?, \?, \?, \?, \?, \?\)`\)\.run\(short_id, req\.user\.id, original_title \|\| 'Untitled Link', target_url, password \|\| null, ios_url \|\| null, android_url \|\| null\);/, 'await db.query(`INSERT INTO links (short_id, owner_id, original_title, target_url, password, ios_url, android_url) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [short_id, req.user.id, original_title || \'Untitled Link\', target_url, password || null, ios_url || null, android_url || null]);');

// 6. /api/links (GET)
code = code.replace(/app\.get\('\/api\/links', verifyAuth, \(req, res\) => \{/, 'app.get(\'/api/links\', verifyAuth, async (req, res) => {');
code = code.replace(/const rows = db\.prepare\(`SELECT short_id, original_title, target_url, scan_count, created_at, password, ios_url, android_url FROM links WHERE owner_id = \? ORDER BY created_at DESC`\)\.all\(req\.user\.id\);/, 'const rows = (await db.query(`SELECT short_id, original_title, target_url, scan_count, created_at, password, ios_url, android_url FROM links WHERE owner_id = $1 ORDER BY created_at DESC`, [req.user.id])).rows;');

// 7. /api/links/:short_id (PUT)
code = code.replace(/const existing = db\.prepare\(`SELECT short_id FROM links WHERE short_id = \?`\)\.get\(finalShortId\);/, 'const existing = (await db.query(`SELECT short_id FROM links WHERE short_id = $1`, [finalShortId])).rows[0];');
code = code.replace(/info = db\.prepare\(`UPDATE links SET target_url = \?, original_title = \?, short_id = \?, password = \?, ios_url = \?, android_url = \? WHERE short_id = \? AND owner_id = \?`\)\.run\(target_url, original_title, finalShortId, password \|\| null, ios_url \|\| null, android_url \|\| null, req\.params\.short_id, req\.user\.id\);/, 'info = await db.query(`UPDATE links SET target_url = $1, original_title = $2, short_id = $3, password = $4, ios_url = $5, android_url = $6 WHERE short_id = $7 AND owner_id = $8`, [target_url, original_title, finalShortId, password || null, ios_url || null, android_url || null, req.params.short_id, req.user.id]);');
code = code.replace(/info = db\.prepare\(`UPDATE links SET target_url = \?, short_id = \?, password = \?, ios_url = \?, android_url = \? WHERE short_id = \? AND owner_id = \?`\)\.run\(target_url, finalShortId, password \|\| null, ios_url \|\| null, android_url \|\| null, req\.params\.short_id, req\.user\.id\);/, 'info = await db.query(`UPDATE links SET target_url = $1, short_id = $2, password = $3, ios_url = $4, android_url = $5 WHERE short_id = $6 AND owner_id = $7`, [target_url, finalShortId, password || null, ios_url || null, android_url || null, req.params.short_id, req.user.id]);');
code = code.replace(/if \(info\.changes === 0\)/, 'if (info.rowCount === 0)');

// 8. /api/analytics/:short_id (GET)
code = code.replace(/app\.get\('\/api\/analytics\/:short_id', verifyAuth, \(req, res\) => \{/, 'app.get(\'/api/analytics/:short_id\', verifyAuth, async (req, res) => {');
code = code.replace(/const link = db\.prepare\(`SELECT \* FROM links WHERE short_id = \? AND owner_id = \?`\)\.get\(short_id, req\.user\.id\);/, 'const link = (await db.query(`SELECT * FROM links WHERE short_id = $1 AND owner_id = $2`, [short_id, req.user.id])).rows[0];');
code = code.replace(/const timeData = db\.prepare\([\s\S]*?`\)\.all\(short_id\);/, 'const timeData = (await db.query(`SELECT DATE(scanned_at) as date, count(*) as count FROM scan_history WHERE link_id = $1 AND scanned_at >= NOW() - INTERVAL \'7 days\' GROUP BY DATE(scanned_at) ORDER BY DATE(scanned_at) ASC`, [short_id])).rows;');
code = code.replace(/const countryData = db\.prepare\([\s\S]*?`\)\.all\(short_id\);/, 'const countryData = (await db.query(`SELECT country, count(*) as count FROM scan_history WHERE link_id = $1 GROUP BY country ORDER BY count DESC LIMIT 10`, [short_id])).rows;');
code = code.replace(/const osData = db\.prepare\([\s\S]*?`\)\.all\(short_id\);/, 'const osData = (await db.query(`SELECT os, count(*) as count FROM scan_history WHERE link_id = $1 GROUP BY os ORDER BY count DESC LIMIT 10`, [short_id])).rows;');
code = code.replace(/const browserData = db\.prepare\([\s\S]*?`\)\.all\(short_id\);/, 'const browserData = (await db.query(`SELECT browser, count(*) as count FROM scan_history WHERE link_id = $1 GROUP BY browser ORDER BY count DESC LIMIT 10`, [short_id])).rows;');

// 9. /r/verify/:short_id (POST)
code = code.replace(/app\.post\('\/r\/verify\/:short_id', \(req, res\) => \{/, 'app.post(\'/r/verify/:short_id\', async (req, res) => {');
code = code.replace(/const row = db\.prepare\(`SELECT target_url, password, ios_url, android_url FROM links WHERE short_id = \?`\)\.get\(short_id\);/, 'const row = (await db.query(`SELECT target_url, password, ios_url, android_url FROM links WHERE short_id = $1`, [short_id])).rows[0];');

// 10. /r/:short_id (GET)
code = code.replace(/app\.get\('\/r\/:short_id', \(req, res\) => \{/, 'app.get(\'/r/:short_id\', async (req, res) => {');
code = code.replace(/const row = db\.prepare\(`SELECT target_url, password, ios_url, android_url FROM links WHERE short_id = \?`\)\.get\(short_id\);/, 'const row = (await db.query(`SELECT target_url, password, ios_url, android_url FROM links WHERE short_id = $1`, [short_id])).rows[0];');
code = code.replace(/db\.prepare\(`INSERT INTO scan_history \(link_id, country, city, os, browser, device_type\) VALUES \(\?, \?, \?, \?, \?, \?\)`\)\.run\(short_id, country, city, os, browser, device\);/, 'await db.query(`INSERT INTO scan_history (link_id, country, city, os, browser, device_type) VALUES ($1, $2, $3, $4, $5, $6)`, [short_id, country, city, os, browser, device]);');
code = code.replace(/db\.prepare\(`UPDATE links SET scan_count = scan_count \+ 1 WHERE short_id = \?`\)\.run\(short_id\);/, 'await db.query(`UPDATE links SET scan_count = scan_count + 1 WHERE short_id = $1`, [short_id]);');

// 11. Razorpay verification
code = code.replace(/app\.post\('\/api\/verify-subscription', verifyAuth, \(req, res\) => \{/, 'app.post(\'/api/verify-subscription\', verifyAuth, async (req, res) => {');
code = code.replace(/db\.prepare\(`UPDATE users SET subscribed = 1 WHERE id = \?`\)\.run\(req\.user\.id\);/, 'await db.query(`UPDATE users SET subscribed = true WHERE id = $1`, [req.user.id]);');

// 12. Razorpay webhook
code = code.replace(/app\.post\('\/webhooks\/razorpay', \(req, res\) => \{/, 'app.post(\'/webhooks/razorpay\', async (req, res) => {');
code = code.replace(/db\.prepare\(`UPDATE users SET subscribed = 1 WHERE id = \?`\)\.run\(userId\);/, 'await db.query(`UPDATE users SET subscribed = true WHERE id = $1`, [userId]);');

// 13. Paddle webhook
code = code.replace(/app\.post\('\/webhooks\/paddle', \(req, res\) => \{/, 'app.post(\'/webhooks/paddle\', async (req, res) => {');
code = code.replace(/db\.prepare\(`UPDATE users SET subscribed = 1 WHERE id = \?`\)\.run\(customData\.user_id\);/, 'await db.query(`UPDATE users SET subscribed = true WHERE id = $1`, [customData.user_id]);');

fs.writeFileSync('server.js', code);
console.log('Migration of server.js completed successfully');
