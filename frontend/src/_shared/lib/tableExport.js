/** Turn a table (columns + rows) into CSV, JSON or a printed page (save as PDF), all in the browser: nothing is sent anywhere. */

const cell = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const csvCell = (v) => { const s = cell(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export const toCsv = (columns, rows) => [columns.map((c) => csvCell(c.label)).join(','), ...rows.map((r) => columns.map((c) => csvCell(c.value ? c.value(r) : r[c.key])).join(','))].join('\r\n');

export const toRecords = (columns, rows) => rows.map((r) => Object.fromEntries(columns.map((c) => [c.label, c.value ? c.value(r) : r[c.key] ?? null])));

export function download(text, filename, type) {
  const href = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export const downloadCsv = (name, columns, rows) => download('﻿' + toCsv(columns, rows), `${name}.csv`, 'text/csv;charset=utf-8');
export const downloadJson = (name, columns, rows) => download(JSON.stringify(toRecords(columns, rows), null, 2), `${name}.json`, 'application/json');

const esc = (s) => cell(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Open the browser's print dialog on a clean page of the table: choose "Save as PDF" there. */
export function printTable(title, subtitle, columns, rows, numeric = []) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font:12px/1.4 system-ui,sans-serif;color:#111;margin:24px}h1{font-size:16px;margin:0 0 2px}p{margin:0 0 12px;color:#555}
    table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f3f4f6;font-size:11px}
    td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}thead{display:table-header-group}tr{page-break-inside:avoid}
  </style></head><body><h1>${esc(title)}</h1><p>${esc(subtitle)}</p><table><thead><tr>${columns.map((c) => `<th class="${numeric.includes(c.key) ? 'n' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r) => `<tr>${columns.map((c) => `<td class="${numeric.includes(c.key) ? 'n' : ''}">${esc(c.value ? c.value(r) : r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`);
  doc.close();
  frame.contentWindow.focus();
  setTimeout(() => { frame.contentWindow.print(); setTimeout(() => frame.remove(), 2000); }, 250);
}
