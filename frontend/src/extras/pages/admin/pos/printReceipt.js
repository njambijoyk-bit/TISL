/** Lays a till receipt out for the paper chosen and prints it: a customer copy and a store copy, each on its own page. */
export const PAPER = {
  a4: { label: 'A4', page: 'A4', width: '190mm', font: 12 },
  pos110: { label: 'POS 110 mm', page: '110mm auto', width: '104mm', font: 12 },
  pos85: { label: 'POS 85 mm', page: '85mm auto', width: '79mm', font: 11 },
  pos80: { label: 'POS 80 mm', page: '80mm auto', width: '72mm', font: 11 },
  pos58: { label: 'POS 58 mm', page: '58mm auto', width: '48mm', font: 10 },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 });

function copyHtml(r, title) {
  const row = (l, v, cls = '') => `<div class="row ${cls}"><span>${l}</span><span>${v}</span></div>`;
  const lines = r.lines.map((l) => `<div class="line"><div>${esc(l.description)}</div>${row(`${qty(l.quantity)} × ${num(l.rate)}${l.discount > 0 ? ` (−${num(l.discount)})` : ''}`, num(l.amount))}</div>`).join('');
  const taxes = r.taxes.map((t) => row(esc(t.label), num(t.amount))).join('');
  const tenders = r.tenders.map((t) => row(`${esc(t.method)}${t.reference ? ` ${esc(t.reference)}` : ''}`, num(t.amount))).join('');

  return `<section class="copy">
    <div class="c b big">${esc(r.company.name)}</div>
    ${r.company.address ? `<div class="c">${esc(r.company.address)}</div>` : ''}
    ${r.company.phone || r.company.tax_pin ? `<div class="c">${[r.company.phone, r.company.tax_pin ? `PIN ${esc(r.company.tax_pin)}` : null].filter(Boolean).join(' · ')}</div>` : ''}
    ${r.branch ? `<div class="c">${esc(r.branch)}${r.station ? ` · ${esc(r.station)}` : ''}</div>` : ''}
    <hr><div class="c b">${esc(r.document)} ${esc(r.number)}</div>
    <div class="c">${esc(r.at)}${r.cashier ? ` · ${esc(r.cashier)}` : ''}</div>
    ${r.customer ? `<div class="c">${esc(r.customer)}</div>` : ''}
    <div class="c b tag">${title}${r.copy ? ` — COPY (print ${r.prints})` : ''}</div>
    <hr>${lines}<hr>
    ${row('Subtotal', num(r.subtotal))}${taxes}${row('TOTAL', num(r.total), 'b big')}
    <hr>${tenders}
    ${r.tendered != null ? row('Tendered', num(r.tendered)) : ''}${r.change > 0 ? row('Change', num(r.change), 'b') : ''}
    <div class="c qr">${r.qr}</div>
    <div class="c small">Keep this receipt. Returns need it.</div>
  </section>`;
}

export function receiptHtml(r) {
  const p = PAPER[r.paper] ?? PAPER.pos80;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.number)}</title><style>
    @page { size: ${p.page}; margin: ${r.paper === 'a4' ? '14mm' : '2mm'}; }
    * { box-sizing: border-box; } body { margin: 0; font-family: ${r.paper === 'a4' ? 'Arial, sans-serif' : '"Courier New", monospace'}; font-size: ${p.font}px; color: #000; }
    .copy { width: ${p.width}; margin: 0 auto; page-break-after: always; break-after: page; } .copy:last-child { page-break-after: auto; break-after: auto; }
    .c { text-align: center; } .b { font-weight: 700; } .big { font-size: ${p.font + 3}px; } .small { font-size: ${p.font - 2}px; margin-top: 4px; }
    .row { display: flex; justify-content: space-between; gap: 8px; } .line { margin-bottom: 3px; } hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
    .tag { margin-top: 3px; letter-spacing: 0.08em; } .qr svg { width: ${r.paper === 'pos58' ? '28mm' : '24mm'}; height: auto; margin-top: 6px; }
  </style></head><body>${copyHtml(r, 'CUSTOMER COPY')}${copyHtml(r, 'STORE COPY')}</body></html>`;
}

/** Print through a hidden frame so the till page stays where it is. */
export function printReceipt(r) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open(); doc.write(receiptHtml(r)); doc.close();
  const go = () => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 60000); };
  if (doc.readyState === 'complete') setTimeout(go, 100); else frame.onload = () => setTimeout(go, 100);
}
