const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { marked } = require('marked');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { initDatabase, query, get, run, saveDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

marked.setOptions({ breaks: true, gfm: true });

// ========== Multer Upload Config ==========
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = crypto.randomBytes(16).toString('hex');
    cb(null, name + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'website-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

// ========== Frontend Routes ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.get('/link', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'link.html'));
});

app.get('/archive', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'archive.html'));
});

app.get('/post/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'post.html'));
});

// ========== API: Post List ==========
app.get('/api/posts', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const perPage = 10;
  const offset = (page - 1) * perPage;

  const posts = query(
    `SELECT posts.*, (SELECT COUNT(*) FROM comments WHERE post_id = posts.id) as comment_count
     FROM posts WHERE slug NOT IN ('about','link') ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`
  );

  const totalRow = get('SELECT COUNT(*) as count FROM posts WHERE slug NOT IN ("about","link")');
  const totalPages = Math.ceil(totalRow.count / perPage);

  const formattedPosts = posts.map(p => ({
    ...p,
    created_at: formatDate(p.created_at),
    hasPassword: !!p.password,
    content_preview: (p.content || '').substring(0, 200)
  }));

  res.json({ posts: formattedPosts, page, totalPages, totalPosts: totalRow.count });
});

// ========== API: Single Post ==========
app.get('/api/posts/:slug', (req, res) => {
  const post = get('SELECT * FROM posts WHERE slug = ?', [req.params.slug]);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  if (post.password) {
    return res.json({ ...post, needPassword: true });
  }

  const comments = query(
    'SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC',
    [post.id]
  );

  run('UPDATE posts SET views = views + 1 WHERE id = ?', [post.id]);

  res.json({
    ...post,
    content_html: marked(post.content || ''),
    created_at: formatDate(post.created_at),
    comments: comments.map(c => ({ ...c, created_at: formatDate(c.created_at) }))
  });
});

// ========== API: Verify Post Password ==========
app.post('/api/posts/:slug/verify', express.json(), (req, res) => {
  const post = get('SELECT * FROM posts WHERE slug = ?', [req.params.slug]);
  if (!post || !post.password) return res.status(400).json({ error: 'No password required' });

  if (post.password !== req.body.password) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const comments = query(
    'SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC', [post.id]
  );

  res.json({
    ...post,
    content_html: marked(post.content || ''),
    created_at: formatDate(post.created_at),
    comments: comments.map(c => ({ ...c, created_at: formatDate(c.created_at) })),
    verified: true
  });
});

// ========== API: About Page ==========
app.get('/api/about', (req, res) => {
  const post = get("SELECT * FROM posts WHERE slug = 'about'");
  if (!post) return res.status(404).json({ error: 'About page not found' });
  res.json({ ...post, content_html: marked(post.content || '') });
});

// ========== API: Friends Links ==========
app.get('/api/friends', (req, res) => {
  const friends = query('SELECT * FROM friends ORDER BY sort_order ASC');
  res.json({ friends });
});

// ========== API: Nav Links (public) ==========
app.get('/api/nav-links', (req, res) => {
  const links = query('SELECT * FROM nav_links ORDER BY sort_order ASC');
  res.json({ links });
});

// ========== API: Archive ==========
app.get('/api/archive', (req, res) => {
  const posts = query(
    "SELECT title, slug, created_at FROM posts WHERE slug NOT IN ('about','link') ORDER BY created_at DESC"
  );

  const grouped = {};
  for (const post of posts) {
    const d = new Date(post.created_at);
    const key = `${d.getFullYear()}/${d.getMonth() + 1}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ ...post, created_at: formatDate(post.created_at) });
  }
  res.json({ archive: grouped });
});

// ========== API: Search ==========
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ results: [] });

  // Fetch all matching posts; scoring done in JS for title > content priority
  const all = query(
    "SELECT id, title, slug, category, created_at, content FROM posts WHERE password IS NULL AND slug NOT IN ('about','link') AND (title LIKE ? OR content LIKE ? OR category LIKE ?)",
    [`%${q}%`, `%${q}%`, `%${q}%`]
  );

  // Score: title match = 2, content/category match = 1
  const ql = q.toLowerCase();
  const scored = all.map(r => {
    const inTitle = r.title.toLowerCase().includes(ql);
    const inContent = (r.content || '').toLowerCase().includes(ql);
    const score = (inTitle ? 2 : 0) + (inContent ? 1 : 0);
    return { ...r, _score: score };
  });

  // Sort: highest score first, then by date
  scored.sort((a, b) => b._score - a._score || new Date(b.created_at) - new Date(a.created_at));

  // Remove internal fields and format
  const results = scored.map(r => {
    const { content, _score, ...rest } = r;
    return { ...rest, created_at: formatDate(r.created_at) };
  });

  res.json({ results });
});

// ========== API: Submit Comment ==========
app.post('/api/comments', express.json(), (req, res) => {
  const { post_id, author, email, url, content } = req.body;
  if (!author || !email || !content || !post_id) {
    return res.status(400).json({ error: 'Please fill in all required fields' });
  }

  const post = get('SELECT id FROM posts WHERE id = ?', [post_id]);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const result = run(
    'INSERT INTO comments (post_id, author, email, url, content) VALUES (?,?,?,?,?)',
    [post_id, author, email, url || '', content]
  );

  const comment = get('SELECT * FROM comments WHERE id = ?', [result.lastInsertRowid]);
  res.json({ ...comment, created_at: formatDate(comment.created_at) });
});

// ========== API: RSS Feed ==========
app.get('/rss.xml', (req, res) => {
  const posts = query(
    "SELECT * FROM posts WHERE slug NOT IN ('about','link') ORDER BY created_at DESC LIMIT 20"
  );

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>promise</title>
<link>http://localhost:${PORT}</link>
<description>Shall I compare thee to a summer's day?</description>
<language>en</language>
`;

  for (const post of posts) {
    xml += `<item><title><![CDATA[${post.title}]]></title><link>http://localhost:${PORT}/post/${post.slug}</link><description><![CDATA[${(post.content || '').substring(0,300)}]]></description><pubDate>${new Date(post.created_at || Date.now()).toUTCString()}</pubDate></item>`;
  }

  xml += '</channel>\n</rss>';
  res.set('Content-Type', 'application/xml');
  res.send(xml);
});

// ========== Sitemap ==========
app.get('/sitemap.xml', (req, res) => {
  const posts = query("SELECT slug FROM posts WHERE slug NOT IN ('about','link')");
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>http://localhost:${PORT}/</loc></url>
  <url><loc>http://localhost:${PORT}/about</loc></url>
  <url><loc>http://localhost:${PORT}/link</loc></url>
  <url><loc>http://localhost:${PORT}/archive</loc></url>
`;
  for (const p of posts) {
    xml += `  <url><loc>http://localhost:${PORT}/post/${p.slug}</loc></url>\n`;
  }
  xml += '</urlset>';
  res.set('Content-Type', 'application/xml');
  res.send(xml);
});

app.get('/sitemap', (req, res) => {
  res.redirect('/sitemap.xml');
});

// ========== Admin Backend ==========
app.get('/admin', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/api/admin/login', express.json(), (req, res) => {
  const { username, password } = req.body;
  const admin = get('SELECT * FROM admin WHERE username = ?', [username]);
  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  req.session.isAdmin = true;
  res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Not logged in' });
  next();
}

app.get('/admin/dashboard', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ========== Admin API ==========
app.use('/uploads', express.static(uploadsDir));

app.post('/api/admin/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = '/uploads/' + req.file.filename;
  const mimetype = req.file.mimetype;
  res.json({ url, mimetype });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const postCount = get('SELECT COUNT(*) as count FROM posts').count;
  const commentCount = get('SELECT COUNT(*) as count FROM comments').count;
  const friendCount = get('SELECT COUNT(*) as count FROM friends').count;
  const navLinkCount = get('SELECT COUNT(*) as count FROM nav_links').count;

  const recentComments = query(`
    SELECT c.*, p.title as post_title, p.slug as post_slug
    FROM comments c JOIN posts p ON c.post_id = p.id
    ORDER BY c.created_at DESC LIMIT 10
  `);

  res.json({
    postCount, commentCount, friendCount, navLinkCount,
    recentComments: recentComments.map(c => ({ ...c, created_at: formatDate(c.created_at) }))
  });
});

app.get('/api/admin/posts', requireAdmin, (req, res) => {
  const posts = query('SELECT posts.*, (SELECT COUNT(*) FROM comments WHERE post_id = posts.id) as comment_count FROM posts ORDER BY created_at DESC');
  res.json(posts.map(p => ({ ...p, created_at: formatDate(p.created_at) })));
});

app.post('/api/admin/posts', express.json(), requireAdmin, (req, res) => {
  const { title, content, category, slug, password } = req.body;
  if (!title || !content || !slug) return res.status(400).json({ error: 'Please fill in required fields' });

  const exists = get('SELECT id FROM posts WHERE slug = ?', [slug]);
  if (exists) return res.status(400).json({ error: 'Slug already exists' });

  const result = run(
    'INSERT INTO posts (title, slug, content, category, password) VALUES (?,?,?,?,?)',
    [title, slug, content, category || 'general', password || null]
  );
  res.json({ id: result.lastInsertRowid, success: true });
});

app.put('/api/admin/posts/:id', express.json(), requireAdmin, (req, res) => {
  const { title, content, category, slug, password } = req.body;
  const { id } = req.params;

  const post = get('SELECT * FROM posts WHERE id = ?', [id]);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  if (slug !== post.slug) {
    const exists = get('SELECT id FROM posts WHERE slug = ? AND id != ?', [slug, id]);
    if (exists) return res.status(400).json({ error: 'Slug already exists' });
  }

  run(
    'UPDATE posts SET title=?, content=?, category=?, slug=?, password=?, updated_at=datetime("now","localtime") WHERE id=?',
    [title, content, category || 'general', slug, password || null, id]
  );
  res.json({ success: true });
});

app.delete('/api/admin/posts/:id', requireAdmin, (req, res) => {
  run('DELETE FROM posts WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/admin/friends', requireAdmin, (req, res) => {
  res.json({ friends: query('SELECT * FROM friends ORDER BY sort_order ASC') });
});

app.post('/api/admin/friends', express.json(), requireAdmin, (req, res) => {
  const { name, url, description, sort_order } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Please fill in name and URL' });
  const result = run(
    'INSERT INTO friends (name, url, description, sort_order) VALUES (?,?,?,?)',
    [name, url, description || '', sort_order || 0]
  );
  res.json({ id: result.lastInsertRowid, success: true });
});

app.put('/api/admin/friends/:id', express.json(), requireAdmin, (req, res) => {
  const { name, url, description, sort_order } = req.body;
  run(
    'UPDATE friends SET name=?, url=?, description=?, sort_order=? WHERE id=?',
    [name, url, description || '', sort_order || 0, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/admin/friends/:id', requireAdmin, (req, res) => {
  run('DELETE FROM friends WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ========== Admin API: Nav Links ==========
app.get('/api/admin/nav-links', requireAdmin, (req, res) => {
  res.json({ links: query('SELECT * FROM nav_links ORDER BY sort_order ASC') });
});

app.post('/api/admin/nav-links', express.json(), requireAdmin, (req, res) => {
  const { name, url, sort_order, is_external } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Please fill in name and URL' });
  const result = run(
    'INSERT INTO nav_links (name, url, sort_order, is_external) VALUES (?,?,?,?)',
    [name, url, sort_order || 0, is_external ? 1 : 0]
  );
  res.json({ id: result.lastInsertRowid, success: true });
});

app.put('/api/admin/nav-links/:id', express.json(), requireAdmin, (req, res) => {
  const { name, url, sort_order, is_external } = req.body;
  run(
    'UPDATE nav_links SET name=?, url=?, sort_order=?, is_external=? WHERE id=?',
    [name, url, sort_order || 0, is_external ? 1 : 0, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/admin/nav-links/:id', requireAdmin, (req, res) => {
  run('DELETE FROM nav_links WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/admin/categories', requireAdmin, (req, res) => {
  res.json(query('SELECT * FROM categories'));
});

app.post('/api/admin/categories', express.json(), requireAdmin, (req, res) => {
  try {
    const result = run('INSERT INTO categories (name, slug) VALUES (?,?)', [req.body.name, req.body.slug]);
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (e) {
    res.status(400).json({ error: 'Category already exists' });
  }
});

app.delete('/api/admin/categories/:id', requireAdmin, (req, res) => {
  run('DELETE FROM categories WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/admin/comments', requireAdmin, (req, res) => {
  const comments = query(`
    SELECT c.*, p.title as post_title, p.slug as post_slug
    FROM comments c JOIN posts p ON c.post_id = p.id
    ORDER BY c.created_at DESC
  `);
  res.json(comments.map(c => ({ ...c, created_at: formatDate(c.created_at) })));
});

app.delete('/api/admin/comments/:id', requireAdmin, (req, res) => {
  run('DELETE FROM comments WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.put('/api/admin/password', express.json(), requireAdmin, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const admin = get("SELECT * FROM admin WHERE username = 'promise'");
  if (!bcrypt.compareSync(oldPassword, admin.password)) {
    return res.status(401).json({ error: 'Current password incorrect' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  run("UPDATE admin SET password = ? WHERE username = ?", [hash, 'promise']);
  res.json({ success: true });
});

// ========== 404 Handler ==========
app.use((req, res) => {
  if (req.accepts('html')) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  res.status(404).json({ error: '404' });
});

// ========== Start Server ==========
async function start() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`\n Website started: http://localhost:${PORT}`);
    console.log(` Admin panel: http://localhost:${PORT}/admin`);
    console.log(` Admin account: promise / PROMISE110820qq\n`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});