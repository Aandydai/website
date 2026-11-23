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
const { pinyin } = require('pinyin-pro');

function nameToPinyin(name) {
  try {
    const arr = pinyin(String(name), { toneType: 'none', type: 'array' });
    return (arr || []).join('');
  } catch (e) {
    return '';
  }
}

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
      'media-src': ["'self'", 'blob:'],
      'script-src': ["'self'", "'unsafe-inline'", 'https://challenges.cloudflare.com', 'https://cdnjs.cloudflare.com'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://challenges.cloudflare.com', 'https://cdnjs.cloudflare.com'],
      'img-src': ["'self'", 'data:', 'https://images.unsplash.com', 'https://picsum.photos'],
      'frame-src': ["'self'", 'https://challenges.cloudflare.com', 'https://www.youtube.com', 'https://player.bilibili.com'],
      'connect-src': ["'self'", 'https://challenges.cloudflare.com', 'https://api.dictionaryapi.dev', 'https://api.deepseek.com', 'https://cdnjs.cloudflare.com'],
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
    'camera=(), microphone=(self), geolocation=(), interest-cohort=()'
  );
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Multer with memory storage — files saved to DB, served via /api/files/:id
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4.3 * 1024 * 1024 } // 4.3MB per file (Vercel body limit ~4.5MB)
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

function setUserCookie(res, token) {
  res.cookie('user_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

function requireUser(req, res, next) {
  const token = req.cookies?.user_token;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'promise-blog', audience: 'user' });
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please login again' });
  }
}

function requireUserPage(req, res, next) {
  const token = req.cookies?.user_token;
  if (!token) return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  try {
    jwt.verify(token, JWT_SECRET, { issuer: 'promise-blog', audience: 'user' });
    next();
  } catch {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
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
    window: 2
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
app.get('/vocabulary', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'vocabulary.html')));
app.get('/listening', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'listening.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/speaking', requireUserPage, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'speaking.html')));
app.get('/reading', requireUserPage, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'reading.html')));
app.get('/writing', requireUserPage, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'writing.html')));
app.get('/viewing', requireUserPage, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'viewing.html')));
app.get('/aibb', requireUserPage, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'aibb.html')));
app.get('/textbook', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'textbook.html')));
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
    // TEMPORARY: 2FA bypass for account recovery — remove after user re-binds authenticator
    const TOTP_BYPASS = true;
    const totpValid = TOTP_BYPASS ? true : verifyTOTP(req.body.totp);
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

// ========== User Auth (普通用户登录) ==========
app.post('/api/user/login', async (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) return res.status(400).json({ error: '请输入姓名和密码' });
    const user = await get`SELECT * FROM users WHERE name = ${name}`;
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: '姓名或密码错误' });
    }
    const token = jwt.sign({ id: user.id, name: user.name, role: 'user' }, JWT_SECRET, { expiresIn: '30d', issuer: 'promise-blog', audience: 'user' });
    setUserCookie(res, token);
    res.json({ success: true, name: user.name });
  } catch (err) {
    console.error('POST /api/user/login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/user/logout', (_req, res) => {
  res.clearCookie('user_token');
  res.json({ success: true });
});

app.get('/api/user/me', (req, res) => {
  const token = req.cookies?.user_token;
  if (!token) return res.json({ loggedIn: false });
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'promise-blog', audience: 'user' });
    return res.json({ loggedIn: true, name: decoded.name });
  } catch {
    return res.json({ loggedIn: false });
  }
});

// ========== Admin: 用户管理 ==========
app.get('/api/admin/users', requireAdmin, async (_req, res) => {
  try {
    const users = await query`SELECT id, name, created_at FROM users ORDER BY id`;
    res.json({ users });
  } catch (err) {
    console.error('GET /api/admin/users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/users', requireAdmin, csrfCheck, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: '请输入姓名' });
    const existing = await get`SELECT id FROM users WHERE name = ${name}`;
    if (existing) return res.status(409).json({ error: '该姓名已存在' });
    const pwd = nameToPinyin(name);
    const hash = bcrypt.hashSync(pwd, 10);
    await run`INSERT INTO users (name, password) VALUES (${name}, ${hash})`;
    auditLog(req.adminUser.username, 'create_user', name);
    res.json({ success: true, name, password: pwd });
  } catch (err) {
    console.error('POST /api/admin/users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/users/:id', requireAdmin, csrfCheck, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await get`SELECT * FROM users WHERE id = ${id}`;
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const name = String(req.body.name || '').trim();
    if (name && name !== user.name) {
      const existing = await get`SELECT id FROM users WHERE name = ${name} AND id != ${id}`;
      if (existing) return res.status(409).json({ error: '该姓名已存在' });
      await run`UPDATE users SET name = ${name} WHERE id = ${id}`;
    }
    if (req.body.password && String(req.body.password).trim()) {
      const hash = bcrypt.hashSync(String(req.body.password).trim(), 10);
      await run`UPDATE users SET password = ${hash} WHERE id = ${id}`;
    }
    auditLog(req.adminUser.username, 'update_user', 'id:' + id);
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/admin/users/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/users/:id/reset-password', requireAdmin, csrfCheck, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await get`SELECT * FROM users WHERE id = ${id}`;
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const pwd = nameToPinyin(user.name);
    const hash = bcrypt.hashSync(pwd, 10);
    await run`UPDATE users SET password = ${hash} WHERE id = ${id}`;
    auditLog(req.adminUser.username, 'reset_user_password', user.name);
    res.json({ success: true, name: user.name, password: pwd });
  } catch (err) {
    console.error('POST /api/admin/users/:id/reset-password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, csrfCheck, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await run`DELETE FROM users WHERE id = ${id}`;
    auditLog(req.adminUser.username, 'delete_user', 'id:' + id);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/users/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/users/batch', requireAdmin, csrfCheck, async (req, res) => {
  try {
    const namesText = String(req.body.names || '');
    if (!namesText.trim()) return res.status(400).json({ error: '请输入名单' });
    const lines = namesText.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
    const created = [];
    const skipped = [];
    for (const name of lines) {
      const existing = await get`SELECT id FROM users WHERE name = ${name}`;
      if (existing) { skipped.push(name); continue; }
      const pwd = nameToPinyin(name);
      const hash = bcrypt.hashSync(pwd, 10);
      await run`INSERT INTO users (name, password) VALUES (${name}, ${hash})`;
      created.push({ name, password: pwd });
    }
    auditLog(req.adminUser.username, 'batch_create_users', created.length + ' created');
    res.json({ success: true, created, skipped });
  } catch (err) {
    console.error('POST /api/admin/users/batch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
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
    const { icp, gongan } = req.body;
    if (icp !== undefined) {
      await run`INSERT INTO settings (key, value) VALUES ('icp', ${icp})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    }
    if (gongan !== undefined) {
      await run`INSERT INTO settings (key, value) VALUES ('gongan', ${gongan})
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
    const admin = await get`SELECT * FROM admin WHERE username = ${req.adminUser.username}`;
    if (!admin || !bcrypt.compareSync(oldPassword, admin.password)) {
      return res.status(401).json({ error: 'Current password incorrect' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    await run`UPDATE admin SET password = ${hash} WHERE username = ${req.adminUser.username}`;
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

// ========== Supabase Proxy (for China access) ==========
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

app.use('/api/supabase', async (req, res) => {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }
    const subPath = req.path.replace(/^\/api\/supabase/, '');
    const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const targetUrl = SUPABASE_URL + '/rest/v1' + subPath + query;
    const fetchOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY
      }
    };
    if (req.method === 'POST' || req.method === 'PATCH') {
      fetchOptions.body = JSON.stringify(req.body);
    }
    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.text();
    res.status(response.status).set('Content-Type', 'application/json').send(data);
  } catch (err) {
    console.error('Supabase proxy error:', err);
    res.status(502).json({ error: 'Proxy error' });
  }
});

// ========== DeepSeek AI Proxy ==========
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1';

app.post('/api/deepseek/chat', async (req, res) => {
  try {
    if (!DEEPSEEK_API_KEY) {
      return res.status(503).json({ error: 'DeepSeek API not configured' });
    }
    const { messages, temperature, max_tokens, model, response_format } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    // 仅允许 deepseek-* 模型：默认 deepseek-chat；图片 OCR 需视觉模型 deepseek-flash
    const chosenModel = (typeof model === 'string' && /^deepseek-[a-zA-Z0-9._-]+$/.test(model))
      ? model : 'deepseek-chat';

    const payload = {
      model: chosenModel,
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 2048
    };
    if (response_format && typeof response_format === 'object') payload.response_format = response_format;

    const resp = await fetch(DEEPSEEK_BASE + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DEEPSEEK_API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error('DeepSeek API error:', data);
      return res.status(resp.status).json({ error: data.error?.message || 'DeepSeek API error' });
    }
    res.json(data);
  } catch (err) {
    console.error('DeepSeek proxy error:', err);
    res.status(502).json({ error: 'DeepSeek proxy error' });
  }
});

// ========== Writing: 文件文字提取（图片 OCR / Word / PDF） ==========
// 视觉模型：DeepSeek 官方 API 用 deepseek-flash 接收图片；可用环境变量 DEEPSEEK_VISION_MODEL 覆盖
const DEEPSEEK_VISION_MODEL = process.env.DEEPSEEK_VISION_MODEL || 'deepseek-flash';
const writingLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
function inferImageMime(ext) {
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return '';
}

async function deepseekOCR(buffer, mimetype) {
  const dataUrl = `data:${mimetype};base64,${buffer.toString('base64')}`;
  const prompt = '请完整、逐字提取这张图片中的所有文字（中英文、标点、数字都要），保持原有换行与段落结构。'
    + '不要翻译、不要解释、不要总结、不要补充或删减内容。只输出识别出的原文。';
  const resp = await fetch(DEEPSEEK_BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DEEPSEEK_API_KEY },
    body: JSON.stringify({
      model: DEEPSEEK_VISION_MODEL,
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl } }
      ] }],
      temperature: 0,
      max_tokens: 6000
    })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || ('OCR 失败(HTTP ' + resp.status + ')'));
  const choice = data.choices?.[0];
  const text = (choice?.message?.content || '').trim();
  if (!text && choice?.finish_reason === 'length') {
    throw new Error('图片文字过多导致识别被截断，请分图上传或换更清晰的小图');
  }
  return text;
}

app.post('/api/writing/extract', writingLimiter, requireUser, upload.single('file'), async (req, res) => {
  try {
    if (!DEEPSEEK_API_KEY) return res.status(503).json({ error: 'DeepSeek API 未配置' });
    if (!req.file) return res.status(400).json({ error: '未收到文件' });
    const { buffer, originalname } = req.file;
    const mimetype = req.file.mimetype || '';
    const ext = (String(originalname).match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();

    let text = '';
    const imageMime = IMAGE_MIMES.includes(mimetype) ? mimetype : inferImageMime(ext);
    if (imageMime) {
      text = await deepseekOCR(buffer, imageMime);
    } else if (['.bmp', '.tif', '.tiff', '.heic', '.heif'].includes(ext)) {
      return res.status(415).json({ error: '请先把图片转为 JPG 或 PNG 再上传' });
    } else if (ext === '.docx' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = require('mammoth');
      const out = await mammoth.extractRawText({ buffer });
      text = out.value;
    } else if (ext === '.pdf' || mimetype === 'application/pdf') {
      const pdfParse = require('pdf-parse/lib/pdf-parse.js');
      const out = await pdfParse(buffer);
      text = out.text;
    } else if (ext === '.txt' || mimetype === 'text/plain') {
      text = buffer.toString('utf8');
    } else if (ext === '.doc') {
      return res.status(415).json({ error: '请把 .doc 另存为 .docx 后再上传' });
    } else {
      return res.status(415).json({ error: '不支持的文件类型，请上传图片 / Word(.docx) / PDF / txt' });
    }

    text = String(text || '').replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').replace(/\r\n/g, '\n').trim();
    if (!text) return res.status(422).json({ error: '未能识别出文字，请换一张更清晰的图片或改用文本录入' });
    res.json({ text });
  } catch (err) {
    console.error('writing/extract error:', err);
    res.status(502).json({ error: '文件解析失败：' + (err.message || '未知错误') });
  }
});

// ========== Writing: AI 批改（应用文 / 读后续写） ==========
const WRITING_SPECS = {
  application: {
    label: '应用文', full: 15, words: '80',
    dims: [
      ['content', '内容要点', '是否覆盖题目全部要点'],
      ['language', '语言准确性', '语法、词汇、拼写是否准确'],
      ['structure', '格式与结构', '格式是否规范、行文衔接是否自然']
    ],
    bands: '第五档13-15 / 第四档10-12 / 第三档7-9 / 第二档4-6 / 第一档1-3'
  },
  continuation: {
    label: '读后续写', full: 25, words: '150',
    dims: [
      ['content', '内容衔接', '与原文情节、人物、风格是否衔接紧密，情节是否合理'],
      ['language', '语言表达', '语法词汇是否准确，句式是否多样，描写是否生动'],
      ['structure', '结构连贯', '段落是否连贯，衔接手段是否得当']
    ],
    bands: '第五档21-25 / 第四档16-20 / 第三档11-15 / 第二档6-10 / 第一档1-5'
  }
};

function buildGradeMessages({ type, question, sourceText, promptOpeners, studentEssay }) {
  const spec = WRITING_SPECS[type];
  const dimLines = spec.dims.map(([k]) =>
    `    "${k}": { "score": 该维度得分(整数), "comment": "该维度的中文点评" }`).join(',\n');
  const sys = [
    `你是资深高中英语阅卷老师，严格按高考${spec.label}评分标准批改学生作文。`,
    `满分 ${spec.full} 分，参考词数约 ${spec.words} 词。评分档次：${spec.bands}。`,
    '只输出一个合法 JSON 对象（不要 markdown 代码块、不要任何多余文字），结构如下：',
    '{',
    '  "total": 整数总分,',
    '  "band": "所属档次，例如：第五档",',
    '  "dimensions": {',
    dimLines,
    '  },',
    '  "corrections": [',
    '    { "original": "学生原文中需要修改的片段（必须逐字照抄原文，不得改写或省略）", "corrected": "修改后的片段", "type": "语法|用词|拼写|连贯", "reason": "一句话简洁中文原因，不要写思考过程" }',
    '  ],',
    '  "highlights": ["学生写得好的句子（逐字照抄）"],',
    '  "overall": "总评：中文 2-4 句，先肯定亮点，再指出主要问题与提升建议",',
    '  "polish": "润色后的范文（英文，保持学生原意，词数接近要求）"',
    '}',
    '要求：corrections 每项的 original 必须能在学生原文中精确匹配；覆盖所有明显错误；分数与档次要合理；JSON 必须可被 JSON.parse 解析。'
  ].join('\n');

  const parts = [`题型：${spec.label}（满分 ${spec.full} 分，约 ${spec.words} 词）`];
  parts.push(`\n【题目要求】\n${question || '（学生未提供题目，按通用要求批改）'}`);
  if (type === 'continuation') {
    parts.push(`\n【阅读原文】\n${sourceText || '（未提供）'}`);
    parts.push(`\n【两个段首句】\n${promptOpeners || '（未提供）'}`);
  }
  parts.push(`\n【学生作文】\n${studentEssay}`);
  parts.push('\n请按 system 指示只输出 JSON。');

  return [
    { role: 'system', content: sys },
    { role: 'user', content: parts.join('\n') }
  ];
}

app.post('/api/writing/grade', writingLimiter, requireUser, async (req, res) => {
  try {
    if (!DEEPSEEK_API_KEY) return res.status(503).json({ error: 'DeepSeek API 未配置' });
    if (!req.user.id) return res.status(401).json({ error: '请先登录' });
    const type = req.body.type === 'continuation' ? 'continuation'
      : (req.body.type === 'application' ? 'application' : '');
    if (!type) return res.status(400).json({ error: 'type 必须是 application 或 continuation' });
    const question = String(req.body.question || '').slice(0, 3000);
    const sourceText = String(req.body.sourceText || '').slice(0, 6000);
    const promptOpeners = String(req.body.promptOpeners || '').slice(0, 1000);
    const studentEssay = String(req.body.studentEssay || '').slice(0, 6000);
    if (studentEssay.trim().length < 10) return res.status(400).json({ error: '请先填写学生作文' });

    const messages = buildGradeMessages({ type, question, sourceText, promptOpeners, studentEssay });
    const resp = await fetch(DEEPSEEK_BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DEEPSEEK_API_KEY },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.3,
        max_tokens: 6000,
        response_format: { type: 'json_object' }
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error('writing/grade deepseek error:', data);
      return res.status(resp.status).json({ error: data.error?.message || 'AI 批改失败' });
    }
    let raw = (data.choices?.[0]?.message?.content || '').trim();
    raw = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
    let fb;
    try { fb = JSON.parse(raw); }
    catch (e) {
      const truncated = data.choices?.[0]?.finish_reason === 'length';
      return res.status(502).json({ error: truncated ? 'AI 输出过长被截断，请缩短作文或重试' : 'AI 返回格式异常，请重试' });
    }

    const total = Number.isFinite(Number(fb.total)) ? Math.round(Number(fb.total)) : 0;
    const band = typeof fb.band === 'string' ? fb.band : '';

    const rows = await query`INSERT INTO essays
      (user_id, user_name, essay_type, question, source_text, prompt_openers, student_essay, feedback, score, band, model)
      VALUES (${req.user.id}, ${req.user.name || ''}, ${type}, ${question}, ${sourceText}, ${promptOpeners}, ${studentEssay}, ${JSON.stringify(fb)}, ${total}, ${band}, 'deepseek-chat')
      RETURNING id, created_at`;

    res.json({
      id: rows[0]?.id, created_at: rows[0]?.created_at,
      essay_type: type, score: total, band, feedback: fb
    });
  } catch (err) {
    console.error('writing/grade error:', err);
    res.status(502).json({ error: 'AI 批改失败：' + (err.message || '未知错误') });
  }
});

// 我的批改记录
app.get('/api/essays', requireUser, async (req, res) => {
  try {
    if (!req.user.id) return res.json({ essays: [] });
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const rows = await query`SELECT id, essay_type, score, band, left(student_essay, 80) AS excerpt, created_at
      FROM essays WHERE user_id = ${req.user.id} ORDER BY created_at DESC LIMIT ${limit}`;
    res.json({ essays: rows });
  } catch (err) {
    console.error('GET /api/essays error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 单条详情（本人或管理员）
app.get('/api/essays/:id', requireUser, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: '无效 id' });
    const row = await get`SELECT * FROM essays WHERE id = ${id}`;
    if (!row) return res.status(404).json({ error: '记录不存在' });
    let allowed = row.user_id === req.user.id;
    if (!allowed) {
      const adminToken = req.cookies?.admin_token;
      if (adminToken) { try { jwt.verify(adminToken, JWT_SECRET, { issuer: 'promise-blog', audience: 'admin' }); allowed = true; } catch {} }
    }
    if (!allowed) return res.status(403).json({ error: '无权查看' });
    try { row.feedback = row.feedback ? JSON.parse(row.feedback) : null; } catch { row.feedback = null; }
    res.json(row);
  } catch (err) {
    console.error('GET /api/essays/:id error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 老师/管理员：全班批改记录
app.get('/api/admin/essays', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const rows = await query`SELECT id, user_name, essay_type, score, band, left(student_essay, 80) AS excerpt, created_at
      FROM essays ORDER BY created_at DESC LIMIT ${limit}`;
    res.json({ essays: rows });
  } catch (err) {
    console.error('GET /api/admin/essays error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// ========== Baidu STT Proxy (free tier: 100K calls/month) ==========
const BAIDU_API_KEY = process.env.BAIDU_API_KEY || '';
const BAIDU_SECRET_KEY = process.env.BAIDU_SECRET_KEY || '';
let baiduToken = null, baiduTokenExpiry = 0;

async function getBaiduToken() {
  if (baiduToken && Date.now() < baiduTokenExpiry) return baiduToken;
  const resp = await fetch(
    'https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=' +
    BAIDU_API_KEY + '&client_secret=' + BAIDU_SECRET_KEY,
    { method: 'POST' }
  );
  const data = await resp.json();
  if (data.access_token) {
    baiduToken = data.access_token;
    baiduTokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
    return baiduToken;
  }
  throw new Error('Baidu token error: ' + JSON.stringify(data));
}

app.post('/api/stt', async (req, res) => {
  try {
    if (!BAIDU_API_KEY || !BAIDU_SECRET_KEY) {
      return res.status(503).json({ error: 'Baidu STT not configured' });
    }
    const { audio } = req.body; // base64 WAV audio
    if (!audio) return res.status(400).json({ error: 'audio data required' });

    const token = await getBaiduToken();
    const raw = Buffer.from(audio, 'base64');
    const resp = await fetch('https://vop.baidu.com/server_api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'wav', rate: 16000, channel: 1, cuid: 'promise-speaking',
        token, speech: raw.toString('base64'), len: raw.length,
        dev_pid: 1737, lan: 'en'
      })
    });
    const data = await resp.json();
    if (data.err_no === 0 && data.result) {
      res.json({ success: true, text: data.result[0] });
    } else {
      res.json({ success: false, error: data.err_msg || 'STT failed', code: data.err_no });
    }
  } catch (err) {
    console.error('STT proxy error:', err);
    res.status(502).json({ error: 'STT proxy error' });
  }
});

// ========== Baidu TTS Proxy (text -> MP3 audio) ==========
app.get('/api/tts', async (req, res) => {
  try {
    if (!BAIDU_API_KEY || !BAIDU_SECRET_KEY) {
      return res.status(503).json({ error: 'Baidu TTS not configured' });
    }
    const text = String(req.query.text || '').trim();
    if (!text || text.length > 200) return res.status(400).json({ error: 'text required (max 200 chars)' });
    const token = await getBaiduToken();
    const qs = new URLSearchParams({
      tex: text, tok: token, cuid: 'promise-website', ctp: '1',
      lan: 'en', spd: '4', pit: '5', vol: '5', per: '0', aue: '3'
    });
    const resp = await fetch('https://tsn.baidu.com/text2audio?' + qs.toString());
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const err = await resp.json();
      return res.status(500).json({ error: err.err_msg || 'TTS failed', code: err.err_no });
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (err) {
    console.error('TTS proxy error:', err);
    res.status(502).json({ error: 'TTS proxy error' });
  }
});

// ========== Textbook PDF Proxy (range-request aware for PDF.js) ==========
app.get('/api/textbook/:name', async (req, res) => {
  try {
    const name = req.params.name;
    if (!/^[a-z0-9.-]+\.pdf$/.test(name)) return res.status(400).json({ error: 'Invalid filename' });
    const ghUrl = 'https://github.com/Aandydai/website/releases/download/textbook-v1/' + name;
    // Get file size first
    const headResp = await fetch(ghUrl, { method: 'HEAD' });
    if (!headResp.ok) return res.status(404).json({ error: 'PDF not found' });
    const fileSize = parseInt(headResp.headers.get('content-length') || '0');
    res.set('Content-Type', 'application/pdf');
    res.set('Accept-Ranges', 'bytes');
    res.set('Cache-Control', 'public, max-age=86400');
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0]);
      const end = parts[1] ? parseInt(parts[1]) : Math.min(start + 500000, fileSize - 1);
      const chunkResp = await fetch(ghUrl, {
        headers: { Range: 'bytes=' + start + '-' + end }
      });
      res.status(206);
      res.set('Content-Range', 'bytes ' + start + '-' + end + '/' + fileSize);
      res.set('Content-Length', end - start + 1);
      const buf = Buffer.from(await chunkResp.arrayBuffer());
      res.send(buf);
    } else {
      res.set('Content-Length', fileSize);
      const resp = await fetch(ghUrl);
      const buf = Buffer.from(await resp.arrayBuffer());
      res.send(buf);
    }
  } catch (err) {
    console.error('Textbook proxy error:', err.message);
    res.status(502).json({ error: 'Proxy error' });
  }
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
