import { TextPdf } from './pdfText';
import { earlierOf, fmtDate } from './format';

const INK = [17, 24, 39]; const MUTED = [107, 114, 128]; const LINE = [209, 213, 219]; const BAND = [243, 244, 246]; const ACCENT = [124, 58, 237];

const COLS = { code: 40, item: 104, cur: 312, price: 396, tax: 470, total: 555 };   // left edges, and right edges for the number columns
const NAME_W = 200;

const amount = (n) => (n === null || n === undefined ? '' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }));

/**
 * A price list as a PDF with real text: a header, then a table (code, item and variant, currency, price excluding tax with any earlier price, tax, total), grouped by category.
 * Every price is in its own item's currency. @returns {Blob}
 */
export function priceListPdf({ list, items, company, rule }) {
  const pdf = new TextPdf();
  const rows = [...items].sort((a, b) => String(a.category ?? '~').localeCompare(String(b.category ?? '~')) || a.position - b.position);
  const M = 40; const bottom = pdf.H - 46;
  let y = 0;

  const header = (first) => {
    if (first) {
      pdf.text(company?.name ?? '', M, 50, { size: 15, bold: true, color: ACCENT });
      pdf.text(list.name, M, 72, { size: 12, bold: true, color: INK });
      pdf.text(`Prices as at ${fmtDate(list.as_at)}. They exclude tax, and each price is in its own item's currency.`, M, 87, { size: 8, color: MUTED });
      if (list.description) pdf.text(pdf.fit(list.description, pdf.W - 2 * M, 8), M, 99, { size: 8, color: MUTED });
      y = 112;
    } else {
      pdf.text(`${company?.name ?? ''}  ·  ${list.name}`, M, 34, { size: 8, color: MUTED });
      y = 46;
    }
    pdf.rect(M, y, pdf.W - 2 * M, 16, BAND);
    const t = (s, x, o = {}) => pdf.text(s, x, y + 11, { size: 7.5, bold: true, color: MUTED, ...o });
    t('CODE', COLS.code + 3); t('ITEM', COLS.item); t('CUR', COLS.cur); t('PRICE', COLS.price, { align: 'right' }); t('TAX', COLS.tax, { align: 'right' }); t('TOTAL', COLS.total, { align: 'right' });
    y += 20;
  };

  header(true);
  let group = null;
  rows.forEach((r) => {
    const name = pdf.wrap(r.name, NAME_W, 8.5, true, 2);
    const sub = [r.variant, r.unit].filter(Boolean).join(' · ');
    const height = Math.max(name.length * 10.5 + (sub ? 9.5 : 0), 27) + 6;
    const cat = r.category || 'Other';
    const groupH = cat !== group ? 18 : 0;
    if (y + groupH + height > bottom) { pdf.newPage(); header(false); }
    if (cat !== group) {
      group = cat;
      pdf.text(cat.toUpperCase(), M + 3, y + 9, { size: 8, bold: true, color: ACCENT });
      y += 18;
    }
    pdf.text(pdf.fit(r.code ?? '', 58, 7.5), COLS.code + 3, y + 8, { size: 7.5, color: MUTED });
    name.forEach((l, i) => pdf.text(l, COLS.item, y + 8 + i * 10.5, { size: 8.5, bold: true, color: INK }));
    if (sub) pdf.text(pdf.fit(sub, NAME_W, 7), COLS.item, y + 8 + name.length * 10.5, { size: 7, color: MUTED });
    pdf.text(r.currency_code, COLS.cur, y + 8, { size: 8, color: INK });
    pdf.text(amount(r.price), COLS.price, y + 8, { size: 8.5, bold: true, color: INK, align: 'right' });
    const e = earlierOf(r, rule);
    if (e?.strike) {
      const s = amount(e.strike); const w = pdf.measure(s, 7);
      pdf.text(s, COLS.price, y + 18, { size: 7, color: MUTED, align: 'right' });
      pdf.line(COLS.price - w, y + 15.8, COLS.price, y + 15.8, MUTED, 0.5);
    } else if (e?.was) pdf.text(`Was ${amount(e.was)}, up ${e.up}%`, COLS.price, y + 18, { size: 6.5, color: MUTED, align: 'right' });
    pdf.text(amount(r.tax_amount), COLS.tax, y + 8, { size: 8, color: INK, align: 'right' });
    if (r.tax_name) pdf.text(pdf.fit(r.tax_name, 70, 6.5), COLS.tax, y + 17, { size: 6.5, color: MUTED, align: 'right' });
    if (r.tax_account) pdf.text(pdf.fit(r.tax_account, 70, 6), COLS.tax, y + 24.5, { size: 6, color: MUTED, align: 'right' });
    pdf.text(amount(r.total), COLS.total, y + 8, { size: 8.5, bold: true, color: INK, align: 'right' });
    y += height;
    pdf.line(M, y - 3, pdf.W - M, y - 3, LINE, 0.4);
  });

  // footers, now that the page count is known
  const count = pdf.pages.length;
  pdf.pages.forEach((ops, i) => {
    pdf.cur = ops;
    pdf.text(`${list.name}`, M, pdf.H - 24, { size: 7, color: MUTED });
    pdf.text(`Page ${i + 1} of ${count}`, pdf.W - M, pdf.H - 24, { size: 7, color: MUTED, align: 'right' });
  });

  return pdf.blob(list.name);
}
