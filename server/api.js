const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { VALID_CATEGORIES } = require('./parser');
const { buildReport } = require('./report');

function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'dashboard')));

  app.get('/api/config', (req, res) => {
    res.json({ currency: process.env.CURRENCY_SYMBOL || '$' });
  });

  app.get('/api/expenses', (req, res) => {
    const { from, to, category } = req.query;
    res.json(db.getExpenses({ from, to, category }));
  });

  app.get('/api/summary', (req, res) => {
    const { from, to } = req.query;
    res.json(db.getSummaryByCategory({ from, to }));
  });

  app.get('/api/daily', (req, res) => {
    const { from, to } = req.query;
    res.json(db.getDailyTotals({ from, to }));
  });

  app.get('/api/budgets', (req, res) => {
    const budgets = db.getBudgets().map((b) => ({
      ...b,
      spent: db.getTotalForCategoryThisMonth(b.category),
    }));
    res.json(budgets);
  });

  app.post('/api/budgets', (req, res) => {
    const { category, monthly_limit } = req.body;
    if (!VALID_CATEGORIES.includes(category) || !monthly_limit || monthly_limit <= 0) {
      return res.status(400).json({ error: 'Invalid category or amount' });
    }
    db.setBudget(category, monthly_limit);
    res.json({ ok: true });
  });

  app.get('/api/report/pdf', async (req, res) => {
    const { from, to, label } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query params are required (YYYY-MM-DD)' });
    }
    try {
      const buffer = await buildReport({ from, to, label: label || `${from} to ${to}` });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="expense-report-${from}_to_${to}.pdf"`);
      res.send(buffer);
    } catch (err) {
      console.error('PDF report failed:', err);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  });

  app.get('/api/categories', (req, res) => {
    res.json(VALID_CATEGORIES);
  });

  return app;
}

module.exports = { createServer };
