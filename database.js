const bcrypt = require('bcryptjs');

let _neon = null;
let _sql = null;
let _initPromise = null;

function getSql() {
  if (!_sql) {
    if (!_neon) {
      _neon = require('@neondatabase/serverless').neon;
    }
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('DATABASE_URL or POSTGRES_URL environment variable is required');
    _sql = _neon(url);
  }
  return _sql;
}

async function initDatabase() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const sql = getSql();

    await sql`CREATE TABLE IF NOT EXISTS admin (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      password TEXT DEFAULT NULL,
      views INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      email TEXT NOT NULL,
      url TEXT DEFAULT '',
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS friends (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      description TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`;
    await sql`CREATE TABLE IF NOT EXISTS nav_links (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_external INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS files (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;

    // Seed admin user
    const admins = await sql`SELECT id FROM admin WHERE username = 'promise'`;
    if (admins.length === 0) {
      const hash = bcrypt.hashSync(process.env.ADMIN_INITIAL_PASSWORD || 'PROMISE110820qq', 10);
      await sql`INSERT INTO admin (username, password) VALUES ('promise', ${hash})`;
    }

    // Seed default category
    const cats = await sql`SELECT id FROM categories WHERE slug = 'general'`;
    if (cats.length === 0) {
      await sql`INSERT INTO categories (name, slug) VALUES ('General', 'general')`;
    }

    // Seed sample posts
    const pc = await sql`SELECT COUNT(*) as count FROM posts`;
    if (Number(pc[0].count) === 0) {
      const samplePosts = [
        ['Long Time No See', '20260417-240', "Haven't written anything for a long time.\n\nWork has been very busy lately, leaving early and coming back late every day, feeling like there's not enough time. But the busier I get, the more I feel the need to record something.\n\nLife is probably like this, with ups and downs, busy and free. The important thing is not to forget what you really want in the midst of busyness.\n\nThis post doesn't really have any special content, just want to tell myself: I'm still here, don't forget to write.", 'general'],
        ['Work', '20260227-239', 'A new year, and new challenges at work.\n\nTook on a new project, starting from zero, quite a bit of pressure. But also looking forward to learning new things.\n\nTen years in the workplace, increasingly feel that mindset is more important than ability. Stay curious, keep learning, maintain enthusiasm. This is my requirement for myself.\n\nHope to make progress this year.', 'general'],
        ['Funny', '20260118-237', 'Something super funny happened today.\n\nDuring class, a student suddenly raised their hand and said: Teacher, your hair is very special today.\n\nI subconsciously touched my hair, and found it had statically exploded into an afro at some point, the whole class burst into laughter.\n\nWell, this is the daily life of being a teacher, never knowing what will happen the next second.', 'general'],
        ['Busy', '20260110-236', "It's really too busy lately.\n\nFinal exams are coming up, teaching during the day, grading homework at night, and preparing lessons on weekends. Time is cut into countless fragments.\n\nBut regardless of how busy, health is still the top priority. Finally found time to go for a run today, feeling much more relaxed.\n\nHealth is always the most important asset.", 'general'],
        ['About', 'about', 'Hello, this is promise.\n\nI am an ordinary high school English teacher, working in Qiubei, Yunnan. This is my personal blog, used to record life, work, and some messy thoughts.\n\nThe blog name "promise" comes from the lyrics: A promise is a promise.\n\nThank you for coming here.', 'general']
      ];
      for (const p of samplePosts) {
        await sql`INSERT INTO posts (title, slug, content, category) VALUES (${p[0]}, ${p[1]}, ${p[2]}, ${p[3]})`;
      }
    }

    // Seed friends
    const fc = await sql`SELECT COUNT(*) as count FROM friends`;
    if (Number(fc[0].count) === 0) {
      await sql`INSERT INTO friends (name, url, description, sort_order) VALUES ('Example Blog', 'https://example.com', 'An interesting blog', 1)`;
    }

    // Seed default ICP setting
    const icpRow = await sql`SELECT value FROM settings WHERE key = 'icp'`;
    if (icpRow.length === 0) {
      await sql`INSERT INTO settings (key, value) VALUES ('icp', '云ICP备18023681号-3')`;
    }

    // Seed nav links
    const nc = await sql`SELECT COUNT(*) as count FROM nav_links`;
    if (Number(nc[0].count) === 0) {
      await sql`INSERT INTO nav_links (name, url, sort_order, is_external) VALUES ('Friends', '/link', 0, 0)`;
    }

    console.log('Database initialization complete');
  })();
}

async function query(strings, ...values) {
  await initDatabase();
  return await getSql()(strings, ...values);
}

async function get(strings, ...values) {
  const rows = await query(strings, ...values);
  return rows[0] || null;
}

async function run(strings, ...values) {
  await initDatabase();
  const rows = await getSql()(strings, ...values);
  return { lastInsertRowid: rows?.[0]?.id || 0, changes: rows.length || 0 };
}

function saveDatabase() {}

module.exports = { initDatabase, query, get, run, saveDatabase };
