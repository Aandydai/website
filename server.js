const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const { marked } = require('marked');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const sanitizeHtml = require('sanitize-html');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { put, head, del } = require('@vercel/blob');
const { initDatabase, query, get, run } = require('./database');

// TOTP secret — must be set via env var in production
const TOTP_SECRET = process.env.TOTP_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: TOTP_SECRET must be set in production');
    process.exit(1);
  }
  console.warn('WARNING: Using generated TOTP_SECRET — 2FA codes will change on restart');
  return speakeasy.generateSecret({ name: 'promise-blog' }).base32;
})();
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: ADMIN_TOKEN must be set in production');
    process.exit(1);
  }
  const fallback = crypto.randomBytes(16).toString('hex');
  console.warn('WARNING: Using random ADMIN_TOKEN:', fallback);
  return fallback;
})();

async function auditLog(username, action, detail = '') {
  try {
    await run`INSERT INTO audit_log (username, action, detail) VALUES (${username}, ${action}, ${detail})`;
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

function cleanHTML(html) {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'audio', 'video', 'source', 'iframe', 'figure', 'figcaption', 'details', 'summary', 'del', 'ins', 'sub', 'sup']),
    allowedAttributes: { '*': ['class', 'id', 'title'], a: ['href', 'target', 'rel'], img: ['src', 'alt', 'width', 'height', 'loading'], audio: ['src', 'controls'], video: ['src', 'controls', 'width', 'height'], source: ['src', 'type'], iframe: ['src', 'frameborder', 'allowfullscreen', 'scrolling', 'width', 'height', 'style'] },
    allowedSchemes: ['http', 'https'],
    allowedSchemesAppliedToAttributes: ['href', 'src']
  });
}

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET must be set in production');
    process.exit(1);
  }
  console.warn('WARNING: Using random JWT_SECRET — sessions will be lost on restart');
  return crypto.randomBytes(32).toString('hex');
})();

marked.use({ breaks: true, gfm: true });

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", 'https://challenges.cloudflare.com'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://challenges.cloudflare.com'],
      'img-src': ["'self'", 'data:', 'https://images.unsplash.com', 'https://picsum.photos'],
      'frame-src': ["'self'", 'https://challenges.cloudflare.com', 'https://www.youtube.com', 'https://player.bilibili.com'],
      'connect-src': ["'self'", 'https://challenges.cloudflare.com'],
      'font-src': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'script-src-attr': ["'unsafe-inline'"],
      'report-uri': ['/api/csp-report'],
    }
  },
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Permissions-Policy & Referrer-Policy (removed from helmet v8, set manually)
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Multer with memory storage — files saved to DB, served via /api/files/:id
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4.3 * 1024 * 1024 } // 4.3MB per file
});

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

// ========== Utility Functions ==========
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function sanitize(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// File upload MIME whitelist
const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff',
  'text/html', 'text/css', 'application/javascript',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/webm', 'audio/aac', 'audio/flac',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo',
  'application/pdf', 'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv'
];

// ========== Rate Limiters ==========
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' }
});

const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many comments, please slow down.' }
});

const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many search requests, please slow down.' }
});

// ========== JWT Auth Middleware ==========
function setAuthCookie(res, token) {
  res.cookie('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000
  });
}

function requireAdmin(req, res, next) {
  const token = req.cookies?.admin_token;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'promise-blog', audience: 'admin' });
    req.adminUser = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please login again' });
  }
}

// ========== CSRF Protection ==========
function csrfCheck(req, res, next) {
  if (req.method === 'GET') return next();
  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.headers['x-csrf-token'];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

// ========== CSRF Token Endpoint ==========
app.get('/api/csrf-token', (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('csrf_token', token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600000
  });
  res.json({ csrfToken: token });
});

// ========== Turnstile Config ==========
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '0x4AAAAAADlqE0ldkFp00wjv'; // public key
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: TURNSTILE_SECRET_KEY must be set in production');
    process.exit(1);
  }
  console.warn('WARNING: TURNSTILE_SECRET_KEY not set — Turnstile verification will fail');
  return '';
})();

async function verifyTurnstile(token) {
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: TURNSTILE_SECRET_KEY, response: token })
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

// ========== TOTP Verification ==========
function verifyTOTP(token) {
  if (!token || token.length !== 6) return false;
  return speakeasy.totp.verify({
    secret: TOTP_SECRET,
    encoding: 'base32',
    token: token,
    window: 1
  });
}

// ========== TOTP QR Code Setup Route ==========
app.get('/api/admin/totp-setup', requireAdmin, async (req, res) => {
  const otpauthUrl = speakeasy.otpauthURL({ secret: TOTP_SECRET, label: 'promise-blog', issuer: 'promise' });
  const qr = await QRCode.toDataURL(otpauthUrl);
  res.json({ qr, secret: TOTP_SECRET });
});

// ========== Hidden Admin Entry ==========
function hiddenAdmin(req, res, next) {
  // Check query token first, then fall back to cookie (set on first valid access)
  const queryToken = req.query.token;
  const cookieToken = req.cookies?.admin_entry_token;
  if (queryToken === ADMIN_TOKEN) {
    // Valid token via URL — set a persistent cookie for future visits
    res.cookie('admin_entry_token', ADMIN_TOKEN, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000
    });
    return next();
  }
  if (cookieToken === ADMIN_TOKEN) return next();
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
}

// ========== Image Proxy: Unsplash backgrounds (Picsum fallback) ==========
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';
let bgCache = [];
let bgCacheExpiry = 0;

async function refreshBgUnsplash() {
  const resp = await fetch(
    'https://api.unsplash.com/photos/random?orientation=landscape&count=30',
    { headers: { 'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`, 'Accept-Version': 'v1' } }
  );
  if (!resp.ok) throw new Error(`Unsplash ${resp.status}: ${resp.statusText}`);
  const data = await resp.json();
  return data.map(img => ({
    id: img.id,
    url: img.urls.regular + '&w=1920&q=85',
    author: img.user?.name || 'Unsplash'
  }));
}

async function refreshBgPicsum() {
  const resp = await fetch('https://picsum.photos/v2/list?limit=80');
  if (!resp.ok) throw new Error(`Picsum ${resp.status}`);
  const data = await resp.json();
  return data.map(img => ({
    id: img.id,
    url: `https://picsum.photos/id/${img.id}/1920/1080`,
    author: img.author
  }));
}

async function refreshBgCache() {
  try {
    if (UNSPLASH_ACCESS_KEY) {
      bgCache = await refreshBgUnsplash();
      console.log(`[bg-cache] Refreshed from Unsplash, ${bgCache.length} images`);
    } else {
      bgCache = await refreshBgPicsum();
      console.log(`[bg-cache] Refreshed from Picsum, ${bgCache.length} images`);
    }
    bgCacheExpiry = Date.now() + 45 * 60 * 1000; // 45 min
  } catch (err) {
    console.error('[bg-cache] Primary failed:', err.message);
    // Fallback to Picsum if Unsplash fails
    if (UNSPLASH_ACCESS_KEY) {
      try {
        bgCache = await refreshBgPicsum();
        console.log(`[bg-cache] Fallback to Picsum, ${bgCache.length} images`);
        bgCacheExpiry = Date.now() + 45 * 60 * 1000;
      } catch (e2) {
        console.error('[bg-cache] Picsum fallback also failed:', e2.message);
      }
    }
  }
}

app.get('/api/random-bg/list', async (_req, res) => {
  if (Date.now() > bgCacheExpiry || bgCache.length === 0) {
    await refreshBgCache();
  }
  if (bgCache.length === 0) {
    const fallback = Array.from({ length: 20 }, (_, i) => ({
      url: `https://picsum.photos/id/${1000 + i}/1920/1080`
    }));
    return res.json({ urls: fallback.map(f => f.url) });
  }
  res.json({ urls: bgCache.map(b => b.url) });
});

// ========== Frontend Routes ==========
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
app.get('/posts', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/about', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));
app.get('/link', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'link.html')));
app.get('/links', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'link.html')));
app.get('/archive', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'archive.html')));
app.get('/categories', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'categories.html')));
app.get('/post/:slug', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'post.html')));

// ========== API: Post List ==========
app.get('/api/posts', async (_req, res) => {
  try {
    const page = parseInt(_req.query.page) || 1;
    const perPage = 10;
    const offset = (page - 1) * perPage;
    const category = _req.query.category || '';

    let posts, totalRow;
    if (category) {
      posts = await query`
        SELECT posts.*, (SELECT COUNT(*) FROM comments WHERE post_id = posts.id) as comment_count
        FROM posts WHERE slug NOT IN ('about','link') AND password IS NULL AND category = ${category} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}
      `;
      totalRow = await get`SELECT COUNT(*) as count FROM posts WHERE slug NOT IN ('about','link') AND password IS NULL AND category = ${category}`;
    } else {
      posts = await query`
        SELECT posts.*, (SELECT COUNT(*) FROM comments WHERE post_id = posts.id) as comment_count
        FROM posts WHERE slug NOT IN ('about','link') ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}
      `;
      totalRow = await get`SELECT COUNT(*) as count FROM posts WHERE slug NOT IN ('about','link')`;
    }
    const totalPages = Math.ceil(Number(totalRow.count) / perPage);

    const formattedPosts = posts.map(p => ({
      ...p,
      created_at: formatDate(p.created_at),
      hasPassword: !!p.password,
      content_preview: marked.parse((p.content || '').substring(0, 500)).replace(/<[^>]*>/g, '').substring(0, 200)
    }));

    res.json({ posts: formattedPosts, page, totalPages, totalPosts: Number(totalRow.count) });
  } catch (err) {
    console.error('GET /api/posts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== API: Single Post ==========
app.get('/api/posts/:slug', async (req, res) => {
  try {
    const post = await get`SELECT * FROM posts WHERE slug = ${req.params.slug}`;
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (post.password) {
      delete post.password;
      return res.json({ ...post, needPassword: true });
    }

    const comments = await query`
      SELECT * FROM comments WHERE post_id = ${post.id} ORDER BY created_at ASC
    `;

    if (!req.cookies?.['v_' + post.id]) {
      await run`UPDATE posts SET views = views + 1 WHERE id = ${post.id}`;
      res.cookie('v_' + post.id, '1', { maxAge: 3600000, httpOnly: true, sameSite: 'lax' });
    }

    delete post.password;
    res.json({
      ...post,
      content_html: cleanHTML(marked.parse(post.content || '')),
      created_at: formatDate(post.created_at),
      comments: comments.map(c => ({ ...c, created_at: formatDate(c.created_at) }))
    });
  } catch (err) {
    console.error('GET /api/posts/:slug error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== API: Verify Post Password ==========
app.post('/api/posts/:slug/verify', loginLimiter, async (req, res) => {
  try {
    const post = await get`SELECT * FROM posts WHERE slug = ${req.params.slug}`;
    if (!post || !post.password) return res.status(400).json({ error: 'No password required' });

    if (!post.password.startsWith('$2a$') && !post.password.startsWith('$2b$')) {
      // Auto-migrate legacy plaintext password to bcrypt
      const hashed = bcrypt.hashSync(post.password, 10);
      await run`UPDATE posts SET password = ${hashed} WHERE id = ${post.id}`;
      post.password = hashed;
    }
    if (!bcrypt.compareSync(req.body.password, post.password)) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const comments = await query`
      SELECT * FROM comments WHERE post_id = ${post.id} ORDER BY created_at ASC
    `;

    delete post.password;
    res.json({
      ...post,
      content_html: cleanHTML(marked.parse(post.content || '')),
      created_at: formatDate(post.created_at),
      comments: comments.map(c => ({ ...c, created_at: formatDate(c.created_at) })),
      verified: true
    });
  } catch (err) {
    console.error('POST /api/posts/:slug/verify error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== API: About Page ==========
app.get('/api/about', async (_req, res) => {
  try {
    const post = await get`SELECT * FROM posts WHERE slug = 'about'`;
    if (!post) return res.status(404).json({ error: 'About page not found' });
    delete post.password;
    res.json({ ...post, content_html: cleanHTML(marked.parse(post.content || '')) });
  } catch (err) {
    console.error('GET /api/about error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== API: Friends Links ==========
app.get('/api/friends', async (_req, res) => {
  try {
    const friends = await query`SELECT * FROM friends ORDER BY sort_order ASC`;
    res.json({ friends });
  } catch (err) {
    console.error('GET /api/friends error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== API: Categories List ==========
app.get('/api/categories', async (_req, res) => {
  try {
    const cats = await query`
      SELECT c.*, COUNT(p.id) as post_count FROM categories c
      LEFT JOIN posts p ON p.category = c.name
      GROUP BY c.id ORDER BY c.name ASC
    `;
    res.json({ categories: cats.map(c => ({ ...c, post_count: Number(c.post_count) })) });
  } catch (err) {
    console.error('GET /api/categories error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== API: Nav Links ==========
app.get('/api/nav-links', async (_req, res) => {
  try {
    const links = await query`SELECT * FROM nav_links ORDER BY sort_order ASC`;
    res.json({ links });
  } catch (err) {
    console.error('GET /api/nav-links error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== API: Archive ==========
app.get('/api/archive', async (_req, res) => {
  try {
    const posts = await query`
      SELECT title, slug, created_at FROM posts
      WHERE slug NOT IN ('about','link') AND password IS NULL ORDER BY created_at DESC
    `;

    const grouped = {};
    for (const post of posts) {
      const d = new Date(post.created_at);
      const key = `${d.getFullYear()}/${d.getMonth() + 1}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({ ...post, created_at: formatDate(post.created_at) });
    }
    res.json({ archive: grouped });
  } catch (err) {
    console.error('GET /api/archive error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== API: Search ==========
app.get('/api/search', searchLimiter, async (req, res) => {
  try {
    const q = (req.query.q || '').trim().substring(0, 100);
    if (!q) return res.json({ results: [] });

    const like = `%${q}%`;
    const ql = q.toLowerCase();

    const all = await query`
      SELECT id, title, slug, category, created_at, content
      FROM posts
      WHERE password IS NULL AND slug NOT IN ('about','link')
      AND (title ILIKE ${like} OR content ILIKE ${like} OR category ILIKE ${like})
    `;

    const scored = all.map(r => {
      const inTitle = (r.title || '').toLowerCase().includes(ql);
      const inContent = (r.content || '').toLowerCase().includes(ql);
      const score = (inTitle ? 2 : 0) + (inContent ? 1 : 0);
      return { ...r, _score: score };
    });

    scored.sort((a, b) => b._score - a._score || new Date(b.created_at) - new Date(a.created_at));

    const results = scored.map(r => {
      const { content, _score, ...rest } = r;
      return { ...rest, created_at: formatDate(r.created_at) };
    });

    res.json({ results });
  } catch (err) {
    console.error('GET /api/search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== API: Submit Comment ==========
app.post('/api/comments', commentLimiter, async (req, res) => {
  try {
    const { post_id, author, email, url, content } = req.body;
    if (!author || !email || !content || !post_id) {
      return res.status(400).json({ error: 'Please fill in all required fields' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Length limits
    if (author.length > 50 || content.length > 2000) {
      return res.status(400).json({ error: 'Input too long' });
    }

    const post = await get`SELECT id FROM posts WHERE id = ${post_id}`;
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const result = await run`
      INSERT INTO comments (post_id, author, email, url, content)
      VALUES (${post_id}, ${sanitize(author)}, ${sanitize(email)}, ${sanitize(url || '')}, ${sanitize(content)})
      RETURNING id
    `;

    const comment = await get`SELECT * FROM comments WHERE id = ${result.lastInsertRowid}`;
    res.json({ ...comment, created_at: formatDate(comment.created_at) });
  } catch (err) {
    console.error('POST /api/comments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== RSS Feed ==========
app.get('/rss.xml', async (req, res) => {
  try {
    const baseUrl = SITE_URL.startsWith('http') ? SITE_URL : `${req.protocol}://${req.get('host')}`;
    const posts = await query`
      SELECT * FROM posts WHERE slug NOT IN ('about','link') AND password IS NULL ORDER BY created_at DESC LIMIT 20
    `;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>promise</title>
<link>${baseUrl}</link>
<description>Shall I compare thee to a summer's day?</description>
<language>en</language>
`;

    for (const post of posts) {
      const pubDate = new Date(post.created_at || Date.now()).toUTCString();
      const link = `<link>${baseUrl}/post/${encodeURIComponent(post.slug)}</link>`;
      xml += `<item><title><![CDATA[${post.title}]]></title>${link}<description><![CDATA[${(post.content || '').substring(0, 300)}]]></description><pubDate>${pubDate}</pubDate></item>`;
    }

    xml += '</channel>\n</rss>';
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('GET /rss.xml error:', err);
    res.status(500).send('Error generating RSS feed');
  }
});

// ========== Sitemap ==========
app.get('/sitemap.xml', async (_req, res) => {
  try {
    const baseUrl = SITE_URL.startsWith('http') ? SITE_URL : `${_req.protocol}://${_req.get('host')}`;
    const posts = await query`SELECT slug FROM posts WHERE slug NOT IN ('about','link') AND password IS NULL`;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc></url>
  <url><loc>${baseUrl}/about</loc></url>
  <url><loc>${baseUrl}/link</loc></url>
  <url><loc>${baseUrl}/archive</loc></url>
`;
    for (const p of posts) {
      xml += `  <url><loc>${baseUrl}/post/${p.slug}</loc></url>\n`;
    }
    xml += '</urlset>';
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('GET /sitemap.xml error:', err);
    res.status(500).send('Error generating sitemap');
  }
});

app.get('/sitemap', (_req, res) => res.redirect('/sitemap.xml'));

// ========== Admin Backend ==========
app.get('/api/admin/check', (req, res) => {
  const token = req.cookies?.admin_token;
  if (!token) return res.json({ loggedIn: false });
  try {
    jwt.verify(token, JWT_SECRET, { issuer: 'promise-blog', audience: 'admin' });
    res.json({ loggedIn: true });
  } catch {
    res.json({ loggedIn: false });
  }
});

app.get('/admin', hiddenAdmin, (req, res) => {
  const token = req.cookies?.admin_token;
  if (token) {
    try {
      jwt.verify(token, JWT_SECRET, { issuer: 'promise-blog', audience: 'admin' });
      return res.redirect('/admin/dashboard');
    } catch {}
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/api/admin/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check account lockout
    const lockRow = await get`SELECT value FROM settings WHERE key = 'login_locked_until'`;
    if (lockRow) {
      const lockedUntil = parseInt(lockRow.value);
      if (Date.now() < lockedUntil) {
        const mins = Math.ceil((lockedUntil - Date.now()) / 60000);
        return res.status(429).json({ error: `Account locked. Try again in ${mins} minute(s).` });
      }
      // Lock expired, clear it
      await run`DELETE FROM settings WHERE key = 'login_locked_until'`;
      await run`DELETE FROM settings WHERE key = 'login_failures'`;
    }

    // Validate Turnstile
    const turnstileOk = await verifyTurnstile(req.body['cf-turnstile-response']);
    if (!turnstileOk) {
      return res.status(401).json({ error: 'Please complete the captcha' });
    }

    // Validate TOTP or recovery code
    const totpValid = verifyTOTP(req.body.totp);
    let usedRecovery = false;
    if (!totpValid) {
      // Check recovery codes (one-time use, individually hashed)
      const codes = await query`SELECT key, value FROM settings WHERE key LIKE 'recovery_code_%'`;
      for (const c of codes) {
        if (bcrypt.compareSync(req.body.totp, c.value)) {
          usedRecovery = true;
          await run`DELETE FROM settings WHERE key = ${c.key}`;
          break;
        }
      }
      if (!usedRecovery) {
        return res.status(401).json({ error: 'Invalid verification code' });
      }
    }

    const admin = await get`SELECT * FROM admin WHERE username = ${username}`;
    if (!admin || !bcrypt.compareSync(password, admin.password)) {
      // Track failed attempts
      const failRow = await get`SELECT value FROM settings WHERE key = 'login_failures'`;
      const failures = (failRow ? parseInt(failRow.value) : 0) + 1;
      if (failures >= 5) {
        const lockUntil = Date.now() + 30 * 60 * 1000; // 30 min lockout
        await run`INSERT INTO settings (key, value) VALUES ('login_locked_until', ${String(lockUntil)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
        await run`DELETE FROM settings WHERE key = 'login_failures'`;
        return res.status(429).json({ error: 'Too many failed attempts. Account locked for 30 minutes.' });
      }
      await run`INSERT INTO settings (key, value) VALUES ('login_failures', ${String(failures)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    // Successful login — clear failure counter
    await run`DELETE FROM settings WHERE key = 'login_failures'`;
    await run`DELETE FROM settings WHERE key = 'login_locked_until'`;
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h', issuer: 'promise-blog', audience: 'admin' });
    setAuthCookie(res, token);
    res.json({ success: true, recoveryUsed: usedRecovery });
  } catch (err) {
    console.error('POST /api/admin/login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/logout', csrfCheck, (_req, res) => {
  res.clearCookie('admin_token');
  res.clearCookie('csrf_token');
  res.json({ success: true });
});

app.get('/admin/dashboard', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ========== Admin API: Upload (stores file in DB, returns /api/files/:id URL) ==========
app.post('/api/admin/upload', requireAdmin, csrfCheck, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large (max 4MB)' });
      }
      return res.status(400).json({ error: 'Upload error, please try again' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // MIME type whitelist check
    if (!ALLOWED_MIMES.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'File type not allowed' });
    }

    // Fix UTF-8 filename decoded as Latin-1 by multer/busboy
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const ext = originalName.includes('.') ? originalName.substring(originalName.lastIndexOf('.')) : '';
    const safeName = 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + ext;

    // Upload to Vercel Blob (CDN) — ASCII-safe filename
    const blob = await put(safeName, req.file.buffer, {
      access: 'public',
      contentType: req.file.mimetype,
    });

    // Store CDN URL + original Chinese name in database
    const result = await run`
      INSERT INTO files (filename, mimetype, size, data) VALUES (${originalName}, ${req.file.mimetype}, ${req.file.size}, ${blob.url})
      RETURNING id
    `;
    const fileUrl = '/api/files/' + result.lastInsertRowid;

    // Return short URL — /api/files/:id redirects to CDN
    res.json({ url: fileUrl, filename: originalName, mimetype: req.file.mimetype, size: req.file.size });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ========== Serve uploaded files ==========
app.get('/api/files/:id', async (req, res) => {
  try {
    const file = await get`SELECT * FROM files WHERE id = ${req.params.id}`;
    if (!file) return res.status(404).json({ error: 'File not found' });

    const encodedName = encodeURIComponent(file.filename);
    const contentDisp = `inline; filename*=UTF-8''${encodedName}`;
    const isWebContent = /^(text\/html|text\/css|application\/javascript)$/.test(file.mimetype);

    // Blob CDN files — proxy to add inline + sandbox headers
    if (file.data && file.data.startsWith('https://') && file.data.includes('blob.vercel-storage.com')) {
      const blobRes = await fetch(file.data);
      if (!blobRes.ok) return res.status(404).json({ error: 'File not found' });
      const buf = Buffer.from(await blobRes.arrayBuffer());
      res.set('Content-Type', file.mimetype);
      if (isWebContent) {
        res.set('Content-Security-Policy', "sandbox allow-scripts allow-same-origin");
      }
      res.set('Content-Disposition', contentDisp);
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(buf);
    }

    // Legacy base64 files
    const buf = Buffer.from(file.data, 'base64');
    res.set('Content-Type', file.mimetype);
    if (isWebContent) {
      res.set('Content-Security-Policy', "sandbox allow-scripts allow-same-origin");
    }
    res.set('Content-Disposition', contentDisp);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buf);
  } catch (err) {
    console.error('GET /api/files/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== Admin API: Stats ==========
app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
  try {
    const postCount = (await get`SELECT COUNT(*) as count FROM posts`).count;
    const commentCount = (await get`SELECT COUNT(*) as count FROM comments`).count;
    const friendCount = (await get`SELECT COUNT(*) as count FROM friends`).count;
    const navLinkCount = (await get`SELECT COUNT(*) as count FROM nav_links`).count;

    const recentComments = await query`
      SELECT c.*, p.title as post_title, p.slug as post_slug
      FROM comments c JOIN posts p ON c.post_id = p.id
      ORDER BY c.created_at DESC LIMIT 10
    `;

    res.json({
      postCount: Number(postCount),
      commentCount: Number(commentCount),
      friendCount: Number(friendCount),
      navLinkCount: Number(navLinkCount),
      recentComments: recentComments.map(c => ({ ...c, created_at: formatDate(c.created_at) }))
    });
  } catch (err) {
    console.error('GET /api/admin/stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== Admin API: Posts CRUD ==========
app.get('/api/admin/posts', requireAdmin, async (_req, res) => {
  try {
    const posts = await query`
      SELECT posts.*, (SELECT COUNT(*) FROM comments WHERE post_id = posts.id) as comment_count
      FROM posts ORDER BY created_at DESC
    `;
    res.json(posts.map(p => { delete p.password; return { ...p, created_at: formatDate(p.created_at) }; }));
  } catch (err) {
    console.error('GET /api/admin/posts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/posts', requireAdmin, csrfCheck, async (req, res) => {
  try {
    const { title, content, category, slug, password } = req.body;
    if (!title || !content || !slug) return res.status(400).json({ error: 'Please fill in required fields' });

    const exists = await get`SELECT id FROM posts WHERE slug = ${slug}`;
    if (exists) return res.status(400).json({ error: 'Slug already exists' });

    const hashedPassword = password ? bcrypt.hashSync(password, 10) : null;
    const result = await run`
      INSERT INTO posts (title, slug, content, category, password)
      VALUES (${title}, ${slug}, ${content}, ${category || 'general'}, ${hashedPassword})
      RETURNING id
    `;
    auditLog(req.adminUser.username, 'create_post', `${title} (${slug})`);
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err) {
    console.error('POST /api/admin/posts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/posts/:id', requireAdmin, csrfCheck, async (req, res) => {
  try {
    const { title, content, category, slug, password } = req.body;
    const { id } = req.params;

    const post = await get`SELECT * FROM posts WHERE id = ${id}`;
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (slug !== post.slug) {
      const exists = await get`SELECT id FROM posts WHERE slug = ${slug} AND id != ${id}`;
      if (exists) return res.status(400).json({ error: 'Slug already exists' });
    }

    const hashedPassword = password ? bcrypt.hashSync(password, 10) : null;
    await run`
      UPDATE posts SET title=${title}, content=${content}, category=${category || 'general'},
      slug=${slug}, password=${hashedPassword}, updated_at=NOW() WHERE id=${id}
    `;
    auditLog(req.adminUser.username, 'update_post', `${title} (id:${id})`);
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/admin/posts/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/posts/:id', requireAdmin, csrfCheck, async (req, res) => {
  try {
    await run`DELETE FROM posts WHERE id = ${req.params.id}`;
    auditLog(req.adminUser.username, 'delete_post', `id:${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/posts/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== Admin API: Friends CRUD ==========
app.get('/api/admin/friends', requireAdmin, async (_req, res) => {
  try {
    res.json({ friends: await query`SELECT * FROM friends ORDER BY sort_order ASC` });
  } catch (err) {
    console.error('GET /api/admin/friends error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/friends', requireAdmin, csrfCheck, async (req, res) => {
  try {
    const { name, url, description, sort_order } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'Please fill in name and URL' });
    const result = await run`
      INSERT INTO friends (name, url, description, sort_order)
      VALUES (${name}, ${url}, ${description || ''}, ${sort_order || 0})
      RETURNING id
    `;
    auditLog(req.adminUser.username, 'create_friend', name);
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err) {
    console.error('POST /api/admin/friends error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/friends/:id', requireAdmin, csrfCheck, async (req, res) => {
  try {
    const { name, url, description, sort_order } = req.body;
    await run`
      UPDATE friends SET name=${name}, url=${url}, description=${description || ''},
      sort_order=${sort_order || 0} WHERE id=${req.params.id}
    `;
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/admin/friends/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/friends/:id', requireAdmin, csrfCheck, async (req, res) => {
  try {
    await run`DELETE FROM friends WHERE id = ${req.params.id}`;
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/friends/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== Admin API: Nav Links ==========
app.get('/api/admin/nav-links', requireAdmin, async (_req, res) => {
  try {
    res.json({ links: await query`SELECT * FROM nav_links ORDER BY sort_order ASC` });
  } catch (err) {
    console.error('GET /api/admin/nav-links error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/nav-links', requireAdmin, csrfCheck, async (req, res) => {
  try {
    const { name, url, sort_order, is_external } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'Please fill in name and URL' });
    const result = await run`
      INSERT INTO nav_links (name, url, sort_order, is_external)
      VALUES (${name}, ${url}, ${sort_order || 0}, ${is_external ? 1 : 0})
      RETURNING id
    `;
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err) {
    console.error('POST /api/admin/nav-links error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/nav-links/:id', requireAdmin, csrfCheck, async (req, res) => {
  try {
    const { name, url, sort_order, is_external } = req.body;
    await run`
      UPDATE nav_links SET name=${name}, url=${url}, sort_order=${sort_order || 0},
      is_external=${is_external ? 1 : 0} WHERE id=${req.params.id}
    `;
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/admin/nav-links/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/nav-links/:id', requireAdmin, csrfCheck, async (req, res) => {
  try {
    await run`DELETE FROM nav_links WHERE id = ${req.params.id}`;
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/nav-links/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== Admin API: Categories ==========
app.get('/api/admin/categories', requireAdmin, async (_req, res) => {
  try {
    res.json(await query`SELECT * FROM categories`);
  } catch (err) {
    console.error('GET /api/admin/categories error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/categories', requireAdmin, csrfCheck, async (req, res) => {
  try {
    const result = await run`
      INSERT INTO categories (name, slug) VALUES (${req.body.name}, ${req.body.slug})
      RETURNING id
    `;
    res.json({ id: result.lastInsertRowid, success: true });
  } catch {
    res.status(400).json({ error: 'Category already exists' });
  }
});

app.put('/api/admin/categories/:id', requireAdmin, csrfCheck, async (req, res) => {
  try {
    const { name, slug } = req.body;
    await run`UPDATE categories SET name=${name}, slug=${slug} WHERE id=${req.params.id}`;
    auditLog(req.adminUser.username, 'update_category', slug);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Category slug already exists' });
  }
});

app.delete('/api/admin/categories/:id', requireAdmin, csrfCheck, async (req, res) => {
  try {
    await run`DELETE FROM categories WHERE id = ${req.params.id}`;
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/categories/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== Admin API: CSP Reports ==========
app.get('/api/admin/csp-reports', requireAdmin, async (_req, res) => {
  try {
    const reports = await query`
      SELECT * FROM audit_log WHERE action = 'csp_violation'
      ORDER BY created_at DESC LIMIT 50
    `;
    res.json(reports);
  } catch (err) {
    console.error('GET /api/admin/csp-reports error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== Admin API: Comments ==========
app.get('/api/admin/comments', requireAdmin, async (_req, res) => {
  try {
    const comments = await query`
      SELECT c.*, p.title as post_title, p.slug as post_slug
      FROM comments c JOIN posts p ON c.post_id = p.id
      ORDER BY c.created_at DESC
    `;
    res.json(comments.map(c => ({ ...c, created_at: formatDate(c.created_at) })));
  } catch (err) {
    console.error('GET /api/admin/comments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/comments/:id', requireAdmin, csrfCheck, async (req, res) => {
  try {
    await run`DELETE FROM comments WHERE id = ${req.params.id}`;
    auditLog(req.adminUser.username, 'delete_comment', `id:${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/comments/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== Public: Site Settings ==========
app.get('/api/settings', async (_req, res) => {
  try {
    const rows = await query`SELECT * FROM settings`;
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json({ settings });
  } catch (err) {
    console.error('GET /api/settings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== Admin API: Site Settings ==========
app.get('/api/admin/settings', requireAdmin, async (_req, res) => {
  try {
    const rows = await query`SELECT * FROM settings`;
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json({ settings });
  } catch (err) {
    console.error('GET /api/admin/settings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/settings', requireAdmin, csrfCheck, async (req, res) => {
  try {
    const { icp } = req.body;
    if (icp !== undefined) {
      await run`INSERT INTO settings (key, value) VALUES ('icp', ${icp})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/admin/settings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== Admin API: Generate Recovery Codes ==========
app.post('/api/admin/recovery-codes', requireAdmin, csrfCheck, async (_req, res) => {
  try {
    // Clear old codes
    await run`DELETE FROM settings WHERE key LIKE 'recovery_code_%'`;
    const codes = [];
    for (let i = 0; i < 8; i++) {
      const code = crypto.randomBytes(5).toString('hex'); // 10-char hex
      codes.push(code);
      const hashed = bcrypt.hashSync(code, 10);
      await run`INSERT INTO settings (key, value) VALUES (${'recovery_code_' + i}, ${hashed})`;
    }
    res.json({ codes });
  } catch (err) {
    console.error('POST /api/admin/recovery-codes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== Admin API: Change Password ==========
app.put('/api/admin/password', requireAdmin, csrfCheck, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const admin = await get`SELECT * FROM admin WHERE username = 'promise'`;
    if (!bcrypt.compareSync(oldPassword, admin.password)) {
      return res.status(401).json({ error: 'Current password incorrect' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    await run`UPDATE admin SET password = ${hash} WHERE username = 'promise'`;
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/admin/password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== CSP Violation Report ==========
app.post('/api/csp-report', (req, res) => {
  const report = req.body['csp-report'];
  if (report) {
    console.error('CSP Violation:', JSON.stringify({
      blocked: report['blocked-uri'],
      directive: report['violated-directive'],
      document: report['document-uri'],
      timestamp: new Date().toISOString()
    }));
    auditLog('system', 'csp_violation',
      `${report['violated-directive']} blocked ${report['blocked-uri']} on ${report['document-uri']}`
    ).catch(() => {});
  }
  res.status(204).end();
});

// ========== Static Files (after explicit routes) ==========
app.use(express.static(path.join(__dirname, 'public')));

// ========== 404 Handler ==========
app.use((req, res) => {
  if (req.accepts('html')) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  res.status(404).json({ error: 'Not found' });
});

// ========== Startup ==========
module.exports = app;

if (require.main === module) {
  initDatabase().then(() => {
    app.listen(PORT, () => {
      console.log(`Website running: http://localhost:${PORT}`);
      console.log(`Admin panel: http://localhost:${PORT}/admin`);
    });
  }).catch(err => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
}
