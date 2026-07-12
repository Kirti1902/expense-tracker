const { Telegraf } = require('telegraf');
const db = require('./db');
const { parseExpenseMessage, VALID_CATEGORIES } = require('./parser');
const { buildReport } = require('./report');
const { resolvePeriod } = require('./date-utils');

function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const ownerId = process.env.TELEGRAM_OWNER_ID;
  const currency = process.env.CURRENCY_SYMBOL || '$';

  if (!token || token === 'your_bot_token_here') {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not set — bot will not start. Dashboard/API still work.');
    return null;
  }

  const bot = new Telegraf(token);

  // Only respond to the owner, if configured. This keeps your budget private.
  bot.use((ctx, next) => {
    if (ownerId && ownerId !== 'your_telegram_user_id_here') {
      if (String(ctx.from?.id) !== String(ownerId)) {
        return; // silently ignore anyone else
      }
    }
    return next();
  });

  bot.start((ctx) => {
    ctx.reply(
      `👋 Welcome to your Expense Tracker bot!\n\n` +
      `Log an expense by just typing: e.g. "250 lunch"\n\n` +
      `Commands:\n` +
      `/undo — delete your last entry\n` +
      `/today — today's spending\n` +
      `/month — this month's spending by category\n` +
      `/report <month|year|2026-07|2026> — get a PDF report\n` +
      `/setbudget <category> <amount> — set a monthly budget\n` +
      `/budgets — view all budgets and progress\n` +
      `/categories — list available categories\n` +
      `/help — show this message`
    );
  });
  bot.help((ctx) => ctx.reply('Just type an amount + description, e.g. "250 lunch". Use /budgets, /today, /month, /report, /setbudget, /undo, /categories.'));

  bot.command('categories', (ctx) => {
    ctx.reply(`Categories: ${VALID_CATEGORIES.join(', ')}`);
  });

  bot.command('undo', (ctx) => {
    const id = db.deleteLastExpense();
    ctx.reply(id ? `🗑️ Deleted your last entry (#${id}).` : 'Nothing to undo.');
  });

  bot.command('today', (ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = db.getExpenses({ from: today, to: today });
    if (rows.length === 0) return ctx.reply('No expenses logged today.');
    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    const lines = rows.map((r) => `• ${currency}${r.amount} — ${r.note} (${r.category})`);
    ctx.reply(`Today's spending: ${currency}${total.toFixed(2)}\n\n${lines.join('\n')}`);
  });

  bot.command('month', (ctx) => {
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const summary = db.getSummaryByCategory({ from });
    if (summary.length === 0) return ctx.reply('No expenses logged this month.');
    const total = summary.reduce((sum, r) => sum + r.total, 0);
    const lines = summary.map((r) => `• ${r.category}: ${currency}${r.total.toFixed(2)} (${r.count} entries)`);
    ctx.reply(`This month's total: ${currency}${total.toFixed(2)}\n\n${lines.join('\n')}`);
  });

  bot.command('budgets', (ctx) => {
    const budgets = db.getBudgets();
    if (budgets.length === 0) return ctx.reply('No budgets set yet. Use /setbudget <category> <amount>.');
    const lines = budgets.map((b) => {
      const spent = db.getTotalForCategoryThisMonth(b.category);
      const pct = ((spent / b.monthly_limit) * 100).toFixed(0);
      const bar = progressBar(spent, b.monthly_limit);
      return `${b.category}: ${currency}${spent.toFixed(2)} / ${currency}${b.monthly_limit} (${pct}%)\n${bar}`;
    });
    ctx.reply(lines.join('\n\n'));
  });

  bot.command('setbudget', (ctx) => {
    const parts = ctx.message.text.split(/\s+/).slice(1);
    if (parts.length < 2) return ctx.reply('Usage: /setbudget <category> <amount>\ne.g. /setbudget food 5000');
    const category = parts[0].toLowerCase();
    const amount = parseFloat(parts[1]);
    if (!VALID_CATEGORIES.includes(category)) {
      return ctx.reply(`Unknown category. Valid: ${VALID_CATEGORIES.join(', ')}`);
    }
    if (!amount || amount <= 0) return ctx.reply('Please provide a valid amount.');
    db.setBudget(category, amount);
    ctx.reply(`✅ Monthly budget for ${category} set to ${currency}${amount}.`);
  });

  bot.command('report', async (ctx) => {
    const arg = ctx.message.text.split(/\s+/).slice(1).join(' ');
    const period = resolvePeriod(arg);
    if (!period) {
      return ctx.reply(
        'Usage: /report month | /report year | /report 2026-07 | /report 2026'
      );
    }
    try {
      await ctx.reply(`📄 Generating your ${period.label} report...`);
      const pdfBuffer = await buildReport(period);
      await ctx.replyWithDocument({
        source: pdfBuffer,
        filename: `expense-report-${period.from}_to_${period.to}.pdf`,
      });
    } catch (err) {
      console.error('Report generation failed:', err);
      ctx.reply('⚠️ Something went wrong generating that report. Try again.');
    }
  });

  // Free-text expense logging: "250 lunch"
  bot.on('text', (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return; // unknown command, ignore

    const parsed = parseExpenseMessage(text);
    if (!parsed) {
      return ctx.reply('Didn\'t catch that. Try: "250 lunch" (amount first, then description).');
    }

    db.addExpense(parsed.amount, parsed.category, parsed.note);
    let reply = `✅ Logged ${currency}${parsed.amount} for "${parsed.note}" → ${parsed.category}`;

    const budget = db.getBudget(parsed.category);
    if (budget) {
      const spent = db.getTotalForCategoryThisMonth(parsed.category);
      const pct = spent / budget.monthly_limit;
      if (pct >= 1) {
        reply += `\n\n🚨 You've exceeded your ${parsed.category} budget! (${currency}${spent.toFixed(2)} / ${currency}${budget.monthly_limit})`;
      } else if (pct >= 0.8) {
        reply += `\n\n⚠️ You've used ${(pct * 100).toFixed(0)}% of your ${parsed.category} budget this month.`;
      }
    }

    ctx.reply(reply);
  });

  return bot;
}

function progressBar(spent, limit, length = 12) {
  const filled = Math.min(length, Math.round((spent / limit) * length));
  return '▓'.repeat(filled) + '░'.repeat(length - filled);
}

module.exports = { createBot };
