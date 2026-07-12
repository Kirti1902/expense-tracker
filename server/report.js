const PDFDocument = require('pdfkit');
const db = require('./db');

const LEFT = 50;
const PAGE_WIDTH = 495; // usable width between 50pt margins on a 595pt-wide A4/Letter page
const INK = '#21302A';
const SAGE = '#6E8271';
const LINE = '#C9BFA3';

function colWidths(labels) {
  // Fixed layouts for the two table shapes we use.
  if (labels.length === 4) return [85, 235, 85, 90];   // Date, Description, Category, Amount
  if (labels.length === 3) return [165, 165, 165];       // Category, Entries, Total  (unused, kept for flexibility)
  return Array(labels.length).fill(PAGE_WIDTH / labels.length);
}

function drawRow(doc, cols, widths, { header = false } = {}) {
  const y = doc.y;
  const rowHeight = 20;

  if (y + rowHeight > 740) {
    doc.addPage();
    doc.y = 50;
    return drawRow(doc, cols, widths, { header });
  }

  if (header) {
    doc.rect(LEFT, y, widths.reduce((a, b) => a + b, 0), rowHeight).fill(INK);
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
  } else {
    doc.fillColor('#000000').fontSize(9).font('Helvetica');
  }

  let x = LEFT;
  cols.forEach((c, i) => {
    doc.text(String(c), x + 6, y + 6, { width: widths[i] - 10, ellipsis: true });
    x += widths[i];
  });

  if (!header) {
    doc.moveTo(LEFT, y + rowHeight).lineTo(LEFT + widths.reduce((a, b) => a + b, 0), y + rowHeight)
      .strokeColor(LINE).lineWidth(0.5).stroke();
  }

  doc.x = LEFT;
  doc.y = y + rowHeight;
}

function sectionTitle(doc, text) {
  doc.x = LEFT;
  if (doc.y > 700) { doc.addPage(); doc.y = 50; }
  doc.moveDown(0.6);
  doc.fillColor(INK).fontSize(13).font('Helvetica-Bold').text(text, LEFT);
  doc.moveDown(0.3);
  doc.x = LEFT;
}

/**
 * Builds a PDF expense report for the given date range and resolves to a Buffer.
 * @param {{from: string, to: string, label: string}} params
 */
function buildReport({ from, to, label }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const currency = process.env.CURRENCY_SYMBOL || '$';
      const summary = db.getSummaryByCategory({ from, to });
      const entries = db.getExpenses({ from, to });
      const daily = db.getDailyTotals({ from, to });
      const total = summary.reduce((s, r) => s + r.total, 0);

      // ---- Header ----
      doc.fillColor(INK).fontSize(24).font('Helvetica-Bold').text('Expense Report');
      doc.fillColor(SAGE).fontSize(13).font('Helvetica').text(label);
      doc.fillColor('#888888').fontSize(9)
        .text(`Generated ${new Date().toLocaleString()} · ${from} to ${to}`);
      doc.moveDown(1);

      doc.fillColor(INK).fontSize(20).font('Helvetica-Bold')
        .text(`Total spent: ${currency}${total.toFixed(2)}`);
      doc.fillColor('#555555').fontSize(10).font('Helvetica')
        .text(`${entries.length} entries across ${summary.length} categories`);
      doc.x = LEFT;

      // ---- Category breakdown ----
      sectionTitle(doc, 'Spending by category');
      const catWidths = [175, 90, 130, 100];
      drawRow(doc, ['Category', 'Entries', 'Total', '% of spend'], catWidths, { header: true });
      summary.forEach((row) => {
        const pct = total ? `${((row.total / total) * 100).toFixed(1)}%` : '0%';
        drawRow(doc, [row.category, row.count, `${currency}${row.total.toFixed(2)}`, pct], catWidths);
      });
      if (summary.length === 0) {
        doc.fillColor('#888888').fontSize(10).text('No expenses in this period.', LEFT);
      }

      const rangeDays = (new Date(to) - new Date(from)) / 86400000;

      if (rangeDays > 40) {
        // Year-scale report: show a month-by-month breakdown instead of every entry.
        const monthly = {};
        daily.forEach((d) => {
          const m = d.day.slice(0, 7);
          monthly[m] = (monthly[m] || 0) + d.total;
        });
        sectionTitle(doc, 'Spending by month');
        const monthWidths = [250, 245];
        drawRow(doc, ['Month', 'Total'], monthWidths, { header: true });
        Object.keys(monthly).sort().forEach((m) => {
          drawRow(doc, [m, `${currency}${monthly[m].toFixed(2)}`], monthWidths);
        });
      } else {
        // Month-scale report: list every entry.
        sectionTitle(doc, 'All entries');
        const widths = colWidths(['Date', 'Description', 'Category', 'Amount']);
        drawRow(doc, ['Date', 'Description', 'Category', 'Amount'], widths, { header: true });
        entries.forEach((e) => {
          drawRow(doc, [e.created_at.slice(0, 10), e.note || '', e.category, `${currency}${e.amount.toFixed(2)}`], widths);
        });
        if (entries.length === 0) {
          doc.fillColor('#888888').fontSize(10).text('No expenses in this period.', LEFT);
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildReport };
