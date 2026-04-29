const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');
let db = null;

// sql.js does not support direct parameterized queries, need to use prepare + bind + step
// Wrapper for safe query methods
function runQuery(sql, params = []) {
  // Simple replacement of ? placeholders with actual values (for demo scenarios)
  // Production environment should use prepare + bind
  let idx = 0;
  const finalSql = sql.replace(/\?/g, () => {
    const v = params[idx++];
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  });
  const result = db.exec(finalSql);
  if (!result || result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

function runGet(sql, params = []) {
  const rows = runQuery(sql, params);
  return rows[0] || null;
}

function runExec(sql, params = []) {
  let idx = 0;
  const finalSql = sql.replace(/\?/g, () => {
    const v = params[idx++];
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  });
  db.exec(finalSql);
  saveDatabase();
  // Get last_insert_rowid
  const lid = db.exec('SELECT last_insert_rowid() as id')[0];
  const changes = db.exec('SELECT changes() as c')[0];
  return {
    lastInsertRowid: lid ? lid.values[0][0] : 0,
    changes: changes ? changes.values[0][0] : 0,
  };
}

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Initialize tables
  const tables = [
    `CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      password TEXT DEFAULT NULL,
      views INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      author TEXT NOT NULL,
      email TEXT NOT NULL,
      url TEXT DEFAULT '',
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      description TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS nav_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_external INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`
  ];

  for (const sql of tables) {
    db.exec(sql);
  }

  saveDatabase();

  // Initialize admin
  const admins = db.exec("SELECT id FROM admin WHERE username = 'promise'");
  if (!admins || admins.length === 0) {
    const hash = bcrypt.hashSync('PROMISE110820qq', 10);
    db.run("INSERT INTO admin (username, password) VALUES (?, ?)", ['promise', hash]);
    saveDatabase();
  }

  // Initialize categories
  const cats = db.exec("SELECT id FROM categories WHERE slug = 'daily'");
  if (!cats || cats.length === 0) {
    db.run("INSERT INTO categories (name, slug) VALUES (?, ?)", ['General', 'general']);
    saveDatabase();
  }

  // Initialize sample posts
  const pc = db.exec("SELECT COUNT(*) as c FROM posts");
  const count = (pc && pc[0] && pc[0].values[0]) ? pc[0].values[0][0] : 0;

  if (count === 0) {
    const samplePosts = [
      ['Long Time No See', '20260417-240', 'Haven\'t written anything for a long time.\n\nWork has been very busy lately, leaving early and coming back late every day, feeling like there\'s not enough time. But the busier I get, the more I feel the need to record something.\n\nLife is probably like this, with ups and downs, busy and free. The important thing is not to forget what you really want in the midst of busyness.\n\nThis post doesn\'t really have any special content, just want to tell myself: I\'m still here, don\'t forget to write.', 'general'],
      ['Work', '20260227-239', 'A new year, and new challenges at work.\n\nTook on a new project, starting from zero, quite a bit of pressure. But also looking forward to learning new things.\n\nTen years in the workplace, increasingly feel that mindset is more important than ability. Stay curious, keep learning, maintain enthusiasm. This is my requirement for myself.\n\nHope to make progress this year.', 'general'],
      ['Funny', '20260118-237', 'Something super funny happened today.\n\nDuring class, a student suddenly raised their hand and said: Teacher, your hair is very special today.\n\nI subconsciously touched my hair, and found it had statically exploded into an afro at some point, the whole class burst into laughter.\n\nWell, this is the daily life of being a teacher, never knowing what will happen the next second.', 'general'],
      ['Busy', '20260110-236', 'It\'s really too busy lately.\n\nFinal exams are coming up, teaching during the day, grading homework at night, and preparing lessons on weekends. Time is cut into countless fragments.\n\nBut regardless of how busy, health is still the top priority. Finally found time to go for a run today, feeling much more relaxed.\n\nHealth is always the most important asset.', 'general'],
      ['About', 'about', 'Hello, this is promise.\n\nI am an ordinary high school English teacher, working in Qiubei, Yunnan. This is my personal blog, used to record life, work, and some messy thoughts.\n\nThe blog name "promise" comes from the lyrics: A promise is a promise.\n\nThank you for coming here.', 'general']
    ];
    for (const p of samplePosts) {
      db.run("INSERT INTO posts (title, slug, content, category) VALUES (?, ?, ?, ?)", p);
    }
    saveDatabase();
  }

  // Initialize friends links
  const fc = db.exec("SELECT COUNT(*) as c FROM friends");
  const fcount = (fc && fc[0] && fc[0].values[0]) ? fc[0].values[0][0] : 0;
  if (fcount === 0) {
    db.run("INSERT INTO friends (name, url, description, sort_order) VALUES (?, ?, ?, ?)", ['Example Blog', 'https://example.com', 'An interesting blog', 1]);
    saveDatabase();
  }

  // Initialize nav links (if none exist)
  const nc = db.exec("SELECT COUNT(*) as c FROM nav_links");
  const ncount = (nc && nc[0] && nc[0].values[0]) ? nc[0].values[0][0] : 0;
  if (ncount === 0) {
    db.run("INSERT INTO nav_links (name, url, sort_order, is_external) VALUES (?, ?, ?, ?)", ['Friends', '/link', 0, 0]);
    saveDatabase();
  }

  console.log('Database initialization complete');
  return { query: runQuery, get: runGet, run: runExec, save: saveDatabase };
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

module.exports = { initDatabase, query: runQuery, get: runGet, run: runExec, saveDatabase };