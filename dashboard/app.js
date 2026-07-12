const API = '/api';
let currency = '$';
let categoryChart, dailyChart;

async function fetchJSON(url) {
  const res = await fetch(url);
  return res.json();
}

function monthRange(monthStr) {
  // monthStr = "2026-07"
  const [y, m] = monthStr.split('-').map(Number);
  const from = `${monthStr}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function fmt(amount) {
  return `${currency}${Number(amount).toFixed(2)}`;
}

async function init() {
  const config = await fetchJSON(`${API}/config`);
  currency = config.currency;

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('monthSelect').value = defaultMonth;

  const categories = await fetchJSON(`${API}/categories`);
  const budgetCategorySelect = document.getElementById('budgetCategory');
  const categoryFilterSelect = document.getElementById('categoryFilter');
  categories.forEach((c) => {
    budgetCategorySelect.insertAdjacentHTML('beforeend', `<option value="${c}">${c}</option>`);
    categoryFilterSelect.insertAdjacentHTML('beforeend', `<option value="${c}">${c}</option>`);
  });

  document.getElementById('monthSelect').addEventListener('change', loadAll);
  document.getElementById('categoryFilter').addEventListener('change', loadEntries);
  document.getElementById('addBudgetBtn').addEventListener('click', () => {
    document.getElementById('budgetForm').classList.toggle('hidden');
  });
  document.getElementById('saveBudgetBtn').addEventListener('click', saveBudget);
  document.getElementById('pdfMonthBtn').addEventListener('click', () => downloadReport('month'));
  document.getElementById('pdfYearBtn').addEventListener('click', () => downloadReport('year'));

  await loadAll();
}

async function loadAll() {
  await Promise.all([loadSummary(), loadEntries(), loadBudgets()]);
}

function currentRange() {
  const monthStr = document.getElementById('monthSelect').value;
  return monthRange(monthStr);
}

async function loadSummary() {
  const { from, to } = currentRange();
  const [summary, daily, entries] = await Promise.all([
    fetchJSON(`${API}/summary?from=${from}&to=${to}`),
    fetchJSON(`${API}/daily?from=${from}&to=${to}`),
    fetchJSON(`${API}/expenses?from=${from}&to=${to}`),
  ]);

  const total = summary.reduce((s, r) => s + r.total, 0);
  document.getElementById('totalValue').textContent = fmt(total);
  document.getElementById('entryCount').textContent = entries.length;
  document.getElementById('topCategory').textContent = summary.length ? summary[0].category : '—';

  const daysInRange = daily.length || 1;
  document.getElementById('dailyAvg').textContent = fmt(total / daysInRange);

  renderCategoryChart(summary);
  renderDailyChart(daily, from, to);
}

function renderCategoryChart(summary) {
  const ctx = document.getElementById('categoryChart');
  const palette = ['#6E8271', '#A63D2E', '#8E9E86', '#C9BFA3', '#4C5C54', '#B8A98A', '#7A8C7D'];
  const data = {
    labels: summary.map((s) => s.category),
    datasets: [{
      data: summary.map((s) => s.total),
      backgroundColor: summary.map((_, i) => palette[i % palette.length]),
      borderColor: '#F5F1E4',
      borderWidth: 2,
    }],
  };
  if (categoryChart) categoryChart.destroy();
  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data,
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Inter' }, color: '#21302A', padding: 12 } },
      },
      cutout: '58%',
    },
  });
}

function renderDailyChart(daily, from, to) {
  const ctx = document.getElementById('dailyChart');
  if (dailyChart) dailyChart.destroy();
  dailyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: daily.map((d) => d.day.slice(5)),
      datasets: [{
        data: daily.map((d) => d.total),
        backgroundColor: '#6E8271',
        borderRadius: 3,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'IBM Plex Mono', size: 10 }, color: '#4C5C54' } },
        y: { grid: { color: '#C9BFA3' }, ticks: { font: { family: 'IBM Plex Mono', size: 10 }, color: '#4C5C54' } },
      },
    },
  });
}

async function loadEntries() {
  const { from, to } = currentRange();
  const category = document.getElementById('categoryFilter').value;
  let url = `${API}/expenses?from=${from}&to=${to}`;
  if (category) url += `&category=${category}`;
  const entries = await fetchJSON(url);

  const body = document.getElementById('entriesBody');
  if (entries.length === 0) {
    body.innerHTML = `<p class="empty-note">No entries for this period yet — log one from Telegram.</p>`;
    return;
  }
  body.innerHTML = entries.map((e) => `
    <div class="entry-row">
      <span>${e.created_at.slice(0, 10)}</span>
      <span>${escapeHtml(e.note)}</span>
      <span><span class="cat-tag">${e.category}</span></span>
      <span class="align-right">${fmt(e.amount)}</span>
    </div>
  `).join('');
}

async function loadBudgets() {
  const budgets = await fetchJSON(`${API}/budgets`);
  const list = document.getElementById('budgetList');
  if (budgets.length === 0) {
    list.innerHTML = `<p class="empty-note">No budgets set yet — add one above, or via /setbudget in Telegram.</p>`;
    return;
  }
  list.innerHTML = budgets.map((b) => {
    const pct = Math.min(100, (b.spent / b.monthly_limit) * 100);
    let fillClass = '';
    if (b.spent / b.monthly_limit >= 1) fillClass = 'over';
    else if (b.spent / b.monthly_limit >= 0.8) fillClass = 'warn';
    return `
      <div class="budget-row">
        <div class="budget-row-top">
          <span class="cat-name">${b.category}</span>
          <span>${fmt(b.spent)} / ${fmt(b.monthly_limit)}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${fillClass}" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

async function saveBudget() {
  const category = document.getElementById('budgetCategory').value;
  const monthly_limit = parseFloat(document.getElementById('budgetAmount').value);
  if (!monthly_limit || monthly_limit <= 0) return;
  await fetch(`${API}/budgets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, monthly_limit }),
  });
  document.getElementById('budgetAmount').value = '';
  document.getElementById('budgetForm').classList.add('hidden');
  loadBudgets();
}

function downloadReport(scope) {
  const monthStr = document.getElementById('monthSelect').value;
  let from, to, label;
  if (scope === 'month') {
    ({ from, to } = monthRange(monthStr));
    label = new Date(`${monthStr}-01`).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  } else {
    const year = monthStr.split('-')[0];
    from = `${year}-01-01`;
    to = `${year}-12-31`;
    label = `Year ${year}`;
  }
  const url = `${API}/report/pdf?from=${from}&to=${to}&label=${encodeURIComponent(label)}`;
  window.open(url, '_blank');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

init();
