const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-fallback-key';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const db = require('./db');
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});


let globalMonthlyPlanId = null;
let globalYearlyPlanId = null;

async function ensurePlan() {
  try {
    const plans = await razorpay.plans.all();
    
    // Look for existing plans by amount to assign correctly
    const existingMonthly = plans.items.find(p => p.item.amount === 49900 && p.period === 'monthly');
    const existingYearly = plans.items.find(p => p.item.amount === 479900 && p.period === 'yearly');

    if (existingMonthly) {
      globalMonthlyPlanId = existingMonthly.id;
    } else {
      const planM = await razorpay.plans.create({
        period: 'monthly', interval: 1,
        item: { name: 'Pro Monthly', amount: 49900, currency: 'INR', description: 'Monthly Pro subscription' }
      });
      globalMonthlyPlanId = planM.id;
    }

    if (existingYearly) {
      globalYearlyPlanId = existingYearly.id;
    } else {
      const planY = await razorpay.plans.create({
        period: 'yearly', interval: 1,
        item: { name: 'Pro Yearly', amount: 479900, currency: 'INR', description: 'Yearly Pro subscription' }
      });
      globalYearlyPlanId = planY.id;
    }
    
    console.log('Razorpay Plans ready - Monthly:', globalMonthlyPlanId, '| Yearly:', globalYearlyPlanId);
  } catch (err) {
    console.error('Failed to ensure Razorpay Plans:', err);
  }
}
ensurePlan();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

const multer = require('multer');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'public', 'uploads'))
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed.'));
    }
  }
});

// Middleware
app.use(cors({
  origin: ['https://qrgenplus.com', 'https://www.qrgenplus.com', 'http://localhost:3000'],
  credentials: true
}));
// Webhooks require raw body for signature verification
app.use('/webhook/stripe', express.raw({ type: 'application/json' }));
app.use('/webhooks/razorpay', express.raw({ type: 'application/json' }));
app.use('/webhooks/paddle', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Auth Middleware
const verifyAuth = async (req, res, next) => {
  const token = req.cookies.auth_token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await db.query("SELECT id, username, email, subscribed, stripe_customer_id FROM users WHERE id = $1", [decoded.userId]);
    const row = result.rows[0];
    if (!row) {
      return res.status(401).json({ error: 'User not found.' });
    }
    req.user = row;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
};

// ------------------------------------------------------------------
// API ROUTES
// ------------------------------------------------------------------

async function validateUrlSecurity(targetUrl) {
  // Allow non-URL data types
  if (targetUrl.toUpperCase().startsWith('WIFI:') || 
      targetUrl.toUpperCase().startsWith('BEGIN:VCARD') ||
      targetUrl.toLowerCase().startsWith('mailto:') ||
      targetUrl.toLowerCase().startsWith('tel:') ||
      targetUrl.toLowerCase().startsWith('smsto:')) {
    return { valid: true };
  }

  let urlObj;
  try {
    urlObj = new URL(targetUrl);
  } catch (err) {
    // If it fails URL parsing but didn't match the prefixes above, 
    // it might be raw text. Let's allow it if it has no malicious schemes.
    if (/^(javascript|data|vbscript|file):/i.test(targetUrl)) {
      return { valid: false, error: 'Unsafe data protocol detected.' };
    }
    return { valid: true }; // Treat as raw text
  }

  if (urlObj.protocol !== 'https:' && urlObj.protocol !== 'http:') {
    // It's a URL but not http/https and not handled above
    return { valid: false, error: 'Target URL must use a secure https:// or http:// protocol, or be a valid text payload.' };
  }

  if (urlObj.hostname.includes('qrgenplus.com') || urlObj.hostname === 'localhost') {
    return { valid: false, error: 'Target URL cannot point back to the generator (prevents redirect loops).' };
  }

  // Phishing Protection Mock (Google Safe Browsing)
  if (process.env.GOOGLE_SAFE_BROWSING_KEY) {
     if (['malware.com', 'phishing.net', 'evil.org'].includes(urlObj.hostname)) {
       return { valid: false, error: 'Target URL flagged as malicious by Safe Browsing.' };
     }
  }

  return { valid: true };
}

// Register route
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  
  try {
    const existing = (await db.query("SELECT * FROM users WHERE email = $1", [email])).rows[0];
    if (existing) return res.status(400).json({ error: 'Email already exists' });
    
    const hash = await bcrypt.hash(password, 10);
    const username = email.split('@')[0] + Math.floor(Math.random() * 1000);
    
    const result = await db.query("INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id", [username, email, hash]);
    const token = jwt.sign({ userId: result.rows[0].id }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('auth_token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, message: 'Registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Login route
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  
  try {
    const row = (await db.query("SELECT * FROM users WHERE email = $1", [email])).rows[0];
    if (!row || !row.password_hash) return res.status(401).json({ error: 'Invalid credentials' });
    
    const isValid = await bcrypt.compare(password, row.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign({ userId: row.id }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('auth_token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, message: 'Logged in successfully', user: { id: row.id, email: row.email, username: row.username, subscribed: row.subscribed } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('auth_token', { sameSite: 'none', secure: true });
  res.json({ success: true });
});

// Google Auth route
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Missing credential' });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload['email'];

    if (!email) return res.status(400).json({ error: 'No email found in Google profile' });

    let row = (await db.query("SELECT * FROM users WHERE email = $1", [email])).rows[0];
    
    // If user doesn't exist, register them
    if (!row) {
      const username = email.split('@')[0] + Math.floor(Math.random() * 1000);
      const result = await db.query("INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id", [username, email]);
      row = { id: result.rows[0].id, email, username, subscribed: 0 };
    }

    const token = jwt.sign({ userId: row.id }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('auth_token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, message: 'Logged in successfully', user: { id: row.id, email: row.email, username: row.username, subscribed: row.subscribed } });
  } catch (err) {
    console.error('Google Auth Error:', err);
    res.status(401).json({ error: 'Invalid Google credential' });
  }
});

// Check auth status
app.get('/api/me', verifyAuth, (req, res) => {
  res.json({ user: req.user });
});

// Get public config
app.get('/api/config', (req, res) => {
  res.json({
    paddleToken: process.env.PADDLE_CLIENT_TOKEN || 'dummy_paddle_client_token',
    paddleEnv: (process.env.PADDLE_CLIENT_TOKEN && process.env.PADDLE_CLIENT_TOKEN.startsWith('live')) ? 'production' : 'sandbox'
  });
});

// Upload PDF
app.post('/api/upload-pdf', verifyAuth, upload.single('pdf'), async (req, res) => {
  if (!req.user.subscribed) {
    return res.status(403).json({ error: 'Active subscription required to upload files.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  // File is saved in public/uploads, we serve it as /uploads/filename.pdf
  const target_url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  const original_title = req.file.originalname;

  // Generate short_id
  const short_id = crypto.randomBytes(3).toString('hex');

  try {
    await db.query(`INSERT INTO links (short_id, owner_id, original_title, target_url) VALUES ($1, $2, $3, $4)`, [short_id, req.user.id, original_title, target_url]);
    res.json({
      success: true,
      link: {
        short_id,
        target_url,
        original_title,
        short_url: `${req.protocol}://${req.get('host')}/r/${short_id}`
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create link for PDF' });
  }
});

// Create dynamic link
app.post('/api/links', verifyAuth, async (req, res) => {
  if (!req.user.subscribed) {
    return res.status(403).json({ error: 'Active subscription required to create dynamic links.' });
  }

  const { target_url, original_title, password, ios_url, android_url } = req.body;
  if (!target_url) {
    return res.status(400).json({ error: 'target_url is required' });
  }

  const securityCheck = await validateUrlSecurity(target_url);
  if (!securityCheck.valid) {
    return res.status(400).json({ error: securityCheck.error });
  }

  // Generate 6-char short ID using cryptographically secure random bytes
  const short_id = crypto.randomBytes(3).toString('hex');

  try {
    await db.query(`INSERT INTO links (short_id, owner_id, original_title, target_url, password, ios_url, android_url) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [short_id, req.user.id, original_title || 'Untitled Link', target_url, password || null, ios_url || null, android_url || null]);
    res.json({
      success: true,
      link: {
        short_id,
        target_url,
        original_title,
        short_url: `${req.protocol}://${req.get('host')}/r/${short_id}`
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create link' });
  }
});

// Fetch user's links
app.get('/api/links', verifyAuth, async (req, res) => {
  try {
    const rows = (await db.query(`SELECT short_id, original_title, target_url, scan_count, created_at, password, ios_url, android_url FROM links WHERE owner_id = $1 ORDER BY created_at DESC`, [req.user.id])).rows;
    const host = `${req.protocol}://${req.get('host')}`;
    rows.forEach(r => {
      r.short_url = `${host}/r/${r.short_id}`;
      r.has_password = !!r.password;
    });
    res.json({ links: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

// Update link destination
app.put('/api/links/:short_id', verifyAuth, async (req, res) => {
  if (!req.user.subscribed) {
    return res.status(403).json({ error: 'Active subscription required.' });
  }
  const { target_url, original_title, new_short_id, password, ios_url, android_url } = req.body;
  if (!target_url) return res.status(400).json({ error: 'target_url required' });

  const securityCheck = await validateUrlSecurity(target_url);
  if (!securityCheck.valid) {
    return res.status(400).json({ error: securityCheck.error });
  }

  const finalShortId = new_short_id ? new_short_id.trim() : req.params.short_id;
  
  if (finalShortId.length < 3 || finalShortId.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(finalShortId)) {
    return res.status(400).json({ error: 'Short URL must be 3-50 characters long and contain only letters, numbers, hyphens, and underscores.' });
  }

  try {
    if (finalShortId !== req.params.short_id) {
      const existing = (await db.query(`SELECT short_id FROM links WHERE short_id = $1`, [finalShortId])).rows[0];
      if (existing) {
        return res.status(400).json({ error: 'This Short URL is already taken. Please choose another.' });
      }
    }

    let info;
    if (original_title !== undefined) {
      info = await db.query(`UPDATE links SET target_url = $1, original_title = $2, short_id = $3, password = $4, ios_url = $5, android_url = $6 WHERE short_id = $7 AND owner_id = $8`, [target_url, original_title, finalShortId, password || null, ios_url || null, android_url || null, req.params.short_id, req.user.id]);
    } else {
      info = await db.query(`UPDATE links SET target_url = $1, short_id = $2, password = $3, ios_url = $4, android_url = $5 WHERE short_id = $6 AND owner_id = $7`, [target_url, finalShortId, password || null, ios_url || null, android_url || null, req.params.short_id, req.user.id]);
    }
    if (info.rowCount === 0) {
      return res.status(404).json({ error: 'Link not found or unauthorized' });
    }
    res.json({ success: true, new_short_id: finalShortId });
  } catch (err) {
    console.error(err);
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
       return res.status(400).json({ error: 'This Short URL is already taken.' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/analytics/:short_id', verifyAuth, async (req, res) => {
  try {
    const short_id = req.params.short_id;
    // Verify ownership
    const link = (await db.query(`SELECT * FROM links WHERE short_id = $1 AND owner_id = $2`, [short_id, req.user.id])).rows[0];
    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }
    
    // Group by date (last 7 days)
    const timeData = (await db.query(`SELECT DATE(scanned_at) as date, count(*) as count FROM scan_history WHERE link_id = $1 AND scanned_at >= NOW() - INTERVAL '7 days' GROUP BY DATE(scanned_at) ORDER BY DATE(scanned_at) ASC`, [short_id])).rows;
    
    // Group by country
    const countryData = (await db.query(`SELECT country, count(*) as count FROM scan_history WHERE link_id = $1 GROUP BY country ORDER BY count DESC LIMIT 10`, [short_id])).rows;
    
    // Group by os
    const osData = (await db.query(`SELECT os, count(*) as count FROM scan_history WHERE link_id = $1 GROUP BY os ORDER BY count DESC LIMIT 10`, [short_id])).rows;

    // Group by browser
    const browserData = (await db.query(`SELECT browser, count(*) as count FROM scan_history WHERE link_id = $1 GROUP BY browser ORDER BY count DESC LIMIT 10`, [short_id])).rows;
    
    res.json({ success: true, timeData, countryData, osData, browserData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ------------------------------------------------------------------
// REDIRECT ENGINE
// ------------------------------------------------------------------
app.post('/r/verify/:short_id', async (req, res) => {
  const short_id = req.params.short_id;
  const { password } = req.body;
  try {
    const row = (await db.query(`SELECT target_url, password, ios_url, android_url FROM links WHERE short_id = $1`, [short_id])).rows[0];
    if (!row) {
      return res.redirect('/404.html');
    }
    if (row.password !== password) {
      return res.status(401).send(`
        <html><body style="font-family:sans-serif; text-align:center; padding-top:50px; background:#0f172a; color:white;">
          <h2>Incorrect Password</h2>
          <a href="/r/${short_id}" style="color:#6366f1;">Try Again</a>
        </body></html>
      `);
    }
    res.cookie(`auth_${short_id}`, 'true', { maxAge: 900000, httpOnly: true, secure: true, sameSite: 'none' }); // 15 mins
    res.redirect(`/r/${short_id}`);
  } catch(err) {
    res.redirect('/404.html');
  }
});

app.get('/r/:short_id', async (req, res) => {
  const short_id = req.params.short_id;
  
  try {
    const row = (await db.query(`SELECT l.target_url, l.password, l.ios_url, l.android_url, u.subscribed FROM links l JOIN users u ON l.owner_id = u.id WHERE l.short_id = $1`, [short_id])).rows[0];
    if (!row) {
      return res.redirect('/404.html');
    }

    if (row.subscribed === false) {
      return res.status(403).send(`
        <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
        <body style="font-family:sans-serif; text-align:center; padding-top:100px; background:#0f172a; color:white;">
          <h2 style="margin-bottom:10px;">⏸️ Campaign Paused</h2>
          <p style="color:#94a3b8; margin-bottom:20px;">This dynamic QR code is currently inactive.</p>
          <p style="color:#94a3b8; font-size:14px;">If you are the owner, please log into your <a href="https://qrgenplus.com/dashboard.html" style="color:#6366f1; text-decoration:none;">dashboard</a> to renew your subscription.</p>
        </body>
        </html>
      `);
    }

    // Password Protection
    if (row.password) {
      const authCookie = req.cookies[`auth_${short_id}`];
      if (!authCookie) {
        return res.send(`
          <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
          <body style="font-family:sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; background:#0f172a; color:white;">
            <div style="background:#1e293b; padding:30px; border-radius:12px; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
              <h2 style="margin-top:0;">🔒 Password Protected</h2>
              <p style="color:#94a3b8; font-size:14px; margin-bottom:20px;">This link requires a password.</p>
              <form method="POST" action="/r/verify/${short_id}">
                <input type="password" name="password" placeholder="Enter password" style="width:100%; padding:12px; border-radius:8px; border:1px solid #334155; background:#0f172a; color:white; margin-bottom:15px;" required />
                <button type="submit" style="width:100%; padding:12px; border-radius:8px; border:none; background:#4f46e5; color:white; font-weight:bold; cursor:pointer;">Unlock</button>
              </form>
            </div>
          </body></html>
        `);
      }
    }
    
    // User-Agent Parsing
    const uaString = req.headers['user-agent'] || '';
    const parser = new UAParser(uaString);
    const os = parser.getOS().name || 'Unknown';
    const browser = parser.getBrowser().name || 'Unknown';
    const device = parser.getDevice().type || 'desktop';

    // Track IP and Geo
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();
    let country = 'Unknown';
    let city = 'Unknown';
    if (ip) {
      const geo = geoip.lookup(ip);
      if (geo) {
        country = geo.country || 'Unknown';
        city = geo.city || 'Unknown';
      }
    }
    
    // Insert into scan history
    await db.query(`INSERT INTO scan_history (link_id, country, city, os, browser, device_type) VALUES ($1, $2, $3, $4, $5, $6)`, [short_id, country, city, os, browser, device]);
    
    // Atomically increment scan_count
    await db.query(`UPDATE links SET scan_count = scan_count + 1 WHERE short_id = $1`, [short_id]);
    
    // Smart Routing
    let final_url = row.target_url;
    if (os.toLowerCase().includes('ios') || os.toLowerCase().includes('mac')) {
      if (row.ios_url) final_url = row.ios_url;
    } else if (os.toLowerCase().includes('android')) {
      if (row.android_url) final_url = row.android_url;
    }

    // Redirect or Render Landing Page
    if (final_url.toUpperCase().startsWith('WIFI:')) {
      // Parse WIFI String (e.g. WIFI:S:NetworkName;T:WPA;P:Password;;)
      const ssidMatch = final_url.match(/S:([^;]+)/);
      const passMatch = final_url.match(/P:([^;]+)/);
      const ssid = ssidMatch ? ssidMatch[1] : 'Unknown';
      const pass = passMatch ? passMatch[1] : '';
      
      const fs = require('fs');
      let template = fs.readFileSync(path.join(__dirname, 'public', 'landing_wifi.html'), 'utf8');
      template = template.replace(/\{\{WIFI_SSID\}\}/g, ssid).replace(/\{\{WIFI_PASS\}\}/g, pass);
      return res.send(template);
    } 
    else if (final_url.toUpperCase().startsWith('BEGIN:VCARD')) {
      // Parse vCard
      const nameMatch = final_url.match(/FN:([^\n]+)/);
      const orgMatch = final_url.match(/ORG:([^\n]+)/);
      const phoneMatch = final_url.match(/TEL.*:([^\n]+)/);
      const emailMatch = final_url.match(/EMAIL.*:([^\n]+)/);
      
      const name = nameMatch ? nameMatch[1].trim() : 'Contact';
      const org = orgMatch ? orgMatch[1].trim() : '';
      const phone = phoneMatch ? phoneMatch[1].trim() : '';
      const email = emailMatch ? emailMatch[1].trim() : '';
      const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
      
      const fs = require('fs');
      let template = fs.readFileSync(path.join(__dirname, 'public', 'landing_vcard.html'), 'utf8');
      template = template.replace(/\{\{NAME\}\}/g, name)
                         .replace(/\{\{ORG\}\}/g, org)
                         .replace(/\{\{PHONE\}\}/g, phone)
                         .replace(/\{\{EMAIL\}\}/g, email)
                         .replace(/\{\{INITIALS\}\}/g, initials)
                         .replace(/\{\{VCARD_DATA\}\}/g, final_url.replace(/\n/g, '\\n'));
      return res.send(template);
    }
    else {
      res.redirect(302, final_url);
    }
  } catch (err) {
    console.error("Redirect Error:", err);
    res.redirect('/404.html');
  }
});

// ------------------------------------------------------------------
// RAZORPAY SUBSCRIPTION INTEGRATION
// ------------------------------------------------------------------
app.post('/api/create-subscription', verifyAuth, async (req, res) => {
  try {
    const { interval } = req.body;
    const isYearly = interval === 'yearly';
    const planId = isYearly ? globalYearlyPlanId : globalMonthlyPlanId;

    if (!planId) {
      return res.status(500).json({ error: 'Razorpay Plan not initialized yet' });
    }
    
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: isYearly ? 5 : 12, // Arbitrary future renewals
      notes: {
        user_id: req.user.id.toString()
      }
    });
    res.json({ success: true, subscription_id: subscription.id, key_id: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('Subscription creation failed:', err);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

app.post('/api/verify-subscription', verifyAuth, async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;
    
    const body = razorpay_payment_id + "|" + razorpay_subscription_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      await db.query(`UPDATE users SET subscribed = true WHERE id = $1`, [req.user.id]);
      res.json({ success: true, message: 'Payment verified successfully' });
    } else {
      res.status(400).json({ error: 'Invalid signature' });
    }
  } catch (err) {
    console.error('Verification error:', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

app.post('/webhooks/razorpay', async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'dummy_razorpay_webhook_secret';
    const signature = req.get('X-Razorpay-Signature') || '';

    // Verify signature
    const expectedSignature = crypto.createHmac('sha256', secret).update(req.body).digest('hex');

    const isTest = process.env.RAZORPAY_WEBHOOK_SECRET === 'dummy_razorpay_webhook_secret';
    if (!isTest && expectedSignature !== signature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const payload = JSON.parse(req.body.toString());
    const event = payload.event;
    
    if (event === 'subscription.charged' || event === 'payment.captured') {
      let userId = null;
      if (payload.payload.payment && payload.payload.payment.entity.notes) {
        userId = payload.payload.payment.entity.notes.user_id;
      }
      if (!userId && payload.payload.subscription && payload.payload.subscription.entity.notes) {
        userId = payload.payload.subscription.entity.notes.user_id;
      }

      if (userId) {
        await db.query(`UPDATE users SET subscribed = true WHERE id = $1`, [userId]);
      }
    }
    
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Razorpay Webhook Error:', err);
    res.status(500).json({ error: 'Webhook error' });
  }
});

// ------------------------------------------------------------------
// PADDLE SUBSCRIPTION INTEGRATION
// ------------------------------------------------------------------
app.post('/webhooks/paddle', async (req, res) => {
  try {
    const signatureHeader = req.get('Paddle-Signature') || '';
    const secret = process.env.PADDLE_WEBHOOK_SECRET || 'dummy_paddle_webhook_secret';
    
    const isTest = process.env.PADDLE_WEBHOOK_SECRET === 'dummy_paddle_webhook_secret';
    let isValid = isTest;
    
    if (!isTest) {
      const parts = signatureHeader.split(';');
      let ts = '', h1 = '';
      parts.forEach(p => {
        if (p.startsWith('ts=')) ts = p.substring(3);
        if (p.startsWith('h1=')) h1 = p.substring(3);
      });
      const payloadStr = ts + ':' + req.body.toString();
      const expectedH1 = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
      isValid = (expectedH1 === h1);
    }

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid Paddle signature' });
    }

    const payload = JSON.parse(req.body.toString());
    const eventType = payload.event_type;

    if (eventType === 'subscription.created' || eventType === 'subscription.activated' || eventType === 'transaction.completed') {
      const customData = payload.data && payload.data.custom_data;
      if (customData && customData.user_id) {
        await db.query(`UPDATE users SET subscribed = true WHERE id = $1`, [customData.user_id]);
      }
    }
    
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Paddle Webhook Error:', err);
    res.status(500).json({ error: 'Webhook error' });
  }
});

// ------------------------------------------------------------------
// STATIC FILE SERVING
// ------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
