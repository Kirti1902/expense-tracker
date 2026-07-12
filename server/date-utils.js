// Shared helpers for turning "month" / "year" / "2026-07" / "2026" into
// concrete {from, to, label} date ranges, used by both the bot and the API.

function pad(n) { return String(n).padStart(2, '0'); }

function monthRange(year, month) {
  // month is 1-indexed
  const from = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${pad(month)}-${pad(lastDay)}`;
  const label = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  return { from, to, label };
}

function yearRange(year) {
  return { from: `${year}-01-01`, to: `${year}-12-31`, label: `Year ${year}` };
}

// Parses a period argument like "month", "year", "2026-07", or "2026"
// relative to now. Returns null if unrecognized.
function resolvePeriod(arg) {
  const now = new Date();
  const a = (arg || 'month').toLowerCase().trim();

  if (a === 'month') return monthRange(now.getFullYear(), now.getMonth() + 1);
  if (a === 'year') return yearRange(now.getFullYear());
  if (/^\d{4}-\d{2}$/.test(a)) {
    const [y, m] = a.split('-').map(Number);
    if (m < 1 || m > 12) return null;
    return monthRange(y, m);
  }
  if (/^\d{4}$/.test(a)) return yearRange(Number(a));
  return null;
}

module.exports = { monthRange, yearRange, resolvePeriod };
