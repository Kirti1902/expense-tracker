const Database = require('better-sqlite3');
const path = require('path');

// DATA_DIR lets you point the database at a mounted persistent volume when
// hosting (e.g. Railway/Fly.io volumes). Defaults to the project root for
// local use.
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');
const db = new Database(path.join(dataDir, 'expenses.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS budgets (
    category TEXT PRIMARY KEY,
    monthly_limit REAL NOT NULL
  );
`);

// ---- Expenses ----
function addExpense(amount, category, note) {
  const stmt = db.prepare(
    `INSERT INTO expenses (amount, category, note) VALUES (?, ?, ?)`
  );
  const info = stmt.run(amount, category, note);
  return info.lastInsertRowid;
}

function deleteLastExpense() {
  const last = db.prepare(`SELECT id FROM expenses ORDER BY id DESC LIMIT 1`).get();
  if (!last) return null;
  db.prepare(`DELETE FROM expenses WHERE id = ?`).run(last.id);
  return last.id;
}

function getExpenses({ from, to, category } = {}) {
  let query = `SELECT * FROM expenses WHERE 1=1`;
  const params = [];
  if (from) { query += ` AND date(created_at) >= date(?)`; params.push(from); }
  if (to) { query += ` AND date(created_at) <= date(?)`; params.push(to); }
  if (category) { query += ` AND category = ?`; params.push(category); }
  query += ` ORDER BY created_at DESC`;
  return db.prepare(query).all(...params);
}

function getTotalForCategoryThisMonth(category) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE category = ?
      AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
  `).get(category);
  return row.total;
}

function getSummaryByCategory({ from, to } = {}) {
  let query = `SELECT category, SUM(amount) as total, COUNT(*) as count FROM expenses WHERE 1=1`;
  const params = [];
  if (from) { query += ` AND date(created_at) >= date(?)`; params.push(from); }
  if (to) { query += ` AND date(created_at) <= date(?)`; params.push(to); }
  query += ` GROUP BY category ORDER BY total DESC`;
  return db.prepare(query).all(...params);
}

function getDailyTotals({ from, to } = {}) {
  let query = `SELECT date(created_at) as day, SUM(amount) as total FROM expenses WHERE 1=1`;
  const params = [];
  if (from) { query += ` AND date(created_at) >= date(?)`; params.push(from); }
  if (to) { query += ` AND date(created_at) <= date(?)`; params.push(to); }
  query += ` GROUP BY day ORDER BY day ASC`;
  return db.prepare(query).all(...params);
}

// ---- Budgets ----
function setBudget(category, limit) {
  db.prepare(`
    INSERT INTO budgets (category, monthly_limit) VALUES (?, ?)
    ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit
  `).run(category, limit);
}

function getBudgets() {
  return db.prepare(`SELECT * FROM budgets`).all();
}

function getBudget(category) {
  return db.prepare(`SELECT * FROM budgets WHERE category = ?`).get(category);
}

module.exports = {
  addExpense,
  deleteLastExpense,
  getExpenses,
  getTotalForCategoryThisMonth,
  getSummaryByCategory,
  getDailyTotals,
  setBudget,
  getBudgets,
  getBudget,
};
