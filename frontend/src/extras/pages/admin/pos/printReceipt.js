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

/** One copy of a receipt, laid out like a Tally bill: the business, the bill, the customer, the lines, the totals, the tax by rate, the payment, then the small print. */
function copyHtml(r, title) {
  const c = r.company;
  const narrow = r.paper === 'pos58';
  const row = (l, v, cls = '') => `<div class="row ${cls}"><span>${l}</span><span>${v}</span></div>`;
  const showDisc = r.lines.some((l) => l.discount > 0);
  const lines = narrow
    ? r.lines.map((l, i) => `<div class="line"><div>${i + 1}. ${esc(l.description)}</div>${row(`${qty(l.quantity)} × ${num(l.rate)}${l.discount > 0 ? ` (−${num(l.discount)})` : ''}`, num(l.amount))}</div>`).join('')
    : `<table class="items"><thead><tr><th class="l">SI</th><th class="l">Description</th><th>Qty</th><th>Rate</th>${showDisc ? '<th>Disc</th>' : ''}<th>Amount</th></tr></thead><tbody>${
      r.lines.map((l, i) => `<tr><td class="l">${i + 1}</td><td class="l">${esc(l.description)}</td><td>${qty(l.quantity)}</td><td>${num(l.rate)}</td>${showDisc ? `<td>${l.discount > 0 ? num(l.discount) : ''}</td>` : ''}<td>${num(l.amount)}</td></tr>`).join('')
    }</tbody></table>`;
  const groups = (r.tax_groups ?? []).map((g) => `<tr><td class="l">${esc(g.label)}</td><td>${num(g.base)}</td><td>${num(g.amount)}</td></tr>`).join('');
  const tenders = r.tenders.map((t) => row(`${esc(t.method)}${t.reference ? ` ${esc(t.reference)}` : ''}`, num(t.amount))).join('');
  const sub = r.taxes.length > 0 || r.round_off !== 0;

  return `<section class="copy">
    ${c.logo ? `<div class="c"><img class="logo" src="${c.logo}" alt=""></div>` : ''}
    <div class="c b big">${esc(c.name)}</div>
    ${c.description ? `<div class="c">${esc(c.description)}</div>` : ''}
    ${c.address.map((a) => `<div class="c">${esc(a)}</div>`).join('')}
    ${c.place ? `<div class="c">${esc(c.place)}</div>` : ''}
    ${c.email ? `<div class="c">${esc(c.email)}</div>` : ''}
    ${c.website ? `<div class="c">${esc(c.website)}</div>` : ''}
    ${c.tax_pin ? `<div class="c">PIN: ${esc(c.tax_pin)}</div>` : ''}
    ${r.branch ? `<div class="c">${esc(r.branch)}${r.station ? ` · ${esc(r.station)}` : ''}</div>` : ''}
    <div class="gap"></div>
    <div class="c b">${esc(r.document)}</div>
    ${row(`Bill No.: <b>${esc(r.number)}</b>`, `Time: ${esc(r.time)}`)}
    ${row(`Date: <b>${esc(r.date)}</b>`, r.cashier ? `Served by: ${esc(r.cashier)}` : '')}
    <div class="c b tag">${title}${r.copy ? ` - COPY (print ${r.prints})` : ''}</div>
    ${r.customer || r.customer_pin ? `<div class="gap"></div>${r.customer ? `<div class="b">${esc(r.customer)}</div>` : ''}${r.customer_pin ? `<div>Customer PIN: ${esc(r.customer_pin)}</div>` : ''}` : ''}
    <div class="gap"></div>
    ${lines}<hr>
    ${sub ? row('Subtotal', num(r.subtotal)) : ''}${r.round_off !== 0 ? row('Round off', num(r.round_off)) : ''}${row('TOTAL', num(r.total), 'b big')}
    ${groups ? `<table class="items tax"><thead><tr><th class="l">Tax</th><th>Taxable amount</th><th>Tax</th></tr></thead><tbody>${groups}<tr class="b"><td class="l">Total tax</td><td></td><td>${num(r.tax_total)}</td></tr></tbody></table>` : ''}
    <hr>${tenders}
    ${r.tendered != null ? row('Tendered', num(r.tendered)) : ''}${r.change > 0 ? row('Change', num(r.change), 'b') : ''}
    ${c.declaration ? `<hr><div class="small"><b>Declaration</b><br>${esc(c.declaration)}</div>` : ''}
    ${r.narration ? `<div class="small">Note: ${esc(r.narration)}</div>` : ''}
    <div class="c qr">${r.qr}</div>
    <div class="c small">${esc(c.tagline)}</div>
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
    .gap { height: 6px; } .logo { max-width: 60%; max-height: ${r.paper === 'pos58' ? '14mm' : '20mm'}; margin-bottom: 3px; } table.items { width: 100%; border-collapse: collapse; } .items th { font-weight: 700; text-align: right; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 1px 2px; } .items td { text-align: right; padding: 1px 2px; vertical-align: top; } .items .l { text-align: left; } .items.tax { margin-top: 4px; } .items.tax tr.b td { border-top: 1px solid #000; }
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

/** The X / Z report of a shift, on the paper chosen. */
export function reportHtml(rep, paper) {
  const p = PAPER[paper] ?? PAPER.pos80;
  const row = (l, v, cls = '') => `<div class="row ${cls}"><span>${l}</span><span>${v}</span></div>`;
  const sh = rep.shift;
  const methods = rep.methods.map((m) => `<div class="line"><div>${esc(m.name)}</div>${row('Expected', num(m.expected))}${m.counted != null ? row('Counted', num(m.counted)) + row('Difference', num(m.difference), 'b') : ''}</div>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${rep.kind} report</title><style>
    @page { size: ${p.page}; margin: ${paper === 'a4' ? '14mm' : '2mm'}; }
    body { margin: 0; font-family: ${paper === 'a4' ? 'Arial, sans-serif' : '"Courier New", monospace'}; font-size: ${p.font}px; color: #000; } .wrap { width: ${p.width}; margin: 0 auto; }
    .c { text-align: center; } .b { font-weight: 700; } .row { display: flex; justify-content: space-between; gap: 8px; } hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; } .line { margin-bottom: 4px; }
  </style></head><body><div class="wrap">
    <div class="c b">${rep.kind === 'Z' ? 'Z REPORT - SHIFT CLOSED' : 'X REPORT - SHIFT SO FAR'}</div>
    <div class="c">${esc(sh.station)} · ${esc(sh.user)}</div>
    <div class="c">Opened ${esc(sh.opened_at)}${sh.closed_at ? `<br>Closed ${esc(sh.closed_at)}${sh.closed_by && sh.closed_by !== sh.user ? ` by ${esc(sh.closed_by)}` : ''}` : ''}</div><hr>
    ${row('Opening float', num(sh.opening_float))}
    ${row(`Cash sales (${rep.cash_sales.count})`, num(rep.cash_sales.total))}${row(`Invoices (${rep.invoices.count})`, num(rep.invoices.total))}${row(`Sales orders (${rep.orders.count})`, num(rep.orders.total))}
    ${row(`Payments taken (${rep.receipts.count})`, '')}${row(`Returns (${rep.returns.count})`, num(rep.returns.total))}${row('Refunded', num(rep.refunded))}${row('Discounts', num(rep.discounts))}${row('Voids', String(rep.voids))}<hr>
    ${methods}<hr>
    ${row('Expected cash', num(rep.expected_cash), 'b')}${rep.variance != null ? row(rep.variance === 0 ? 'Balanced' : rep.variance > 0 ? 'Over' : 'Short', num(Math.abs(rep.variance)), 'b') : ''}
    ${sh.note ? `<hr><div>${esc(sh.note)}</div>` : ''}
  </div></body></html>`;
}

export function printReport(rep, paper) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open(); doc.write(reportHtml(rep, paper)); doc.close();
  setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 60000); }, 150);
}
