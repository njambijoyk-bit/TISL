// Label sheets: the page sizes we print on, and the HTML that lays labels out on them. The same HTML is shown as the preview and sent to the printer, so what you see is what prints.

/** key => { name, kind: 'sheet' | 'roll', cols, rows, w, h (mm of one label) } */
export const SIZES = {
  'a4-24': { name: 'A4 sheet, 24 labels (70 × 37 mm)', kind: 'sheet', cols: 3, rows: 8, w: 70, h: 37 },
  'a4-12': { name: 'A4 sheet, 12 labels (99 × 42 mm)', kind: 'sheet', cols: 2, rows: 6, w: 99.1, h: 42.3 },
  'a4-65': { name: 'A4 sheet, 65 small labels (38 × 21 mm)', kind: 'sheet', cols: 5, rows: 13, w: 38.1, h: 21.2 },
  'roll-50x25': { name: 'Label roll, 50 × 25 mm', kind: 'roll', w: 50, h: 25 },
  'roll-40x30': { name: 'Label roll, 40 × 30 mm', kind: 'roll', w: 40, h: 30 },
  'roll-60x40': { name: 'Label roll, 60 × 40 mm', kind: 'roll', w: 60, h: 40 },
  'shelf-60x20': { name: 'Shelf edge strip, 60 × 20 mm', kind: 'roll', w: 60, h: 20 },
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** One label's markup: the code picture and the lines. A 2-D code sits beside its lines, a barcode above them. */
const labelHtml = (l, size) => {
  const small = size.h <= 25;
  const lines = l.lines.map((x) => `<div class="${x.role}">${esc(x.text)}</div>`).join('');
  return `<div class="label ${l.two_d ? 'two' : 'one'} ${small ? 'small' : ''}"><div class="pic">${l.svg}</div><div class="txt">${lines}</div></div>`;
};

/** The full HTML page for the labels (each repeated by its copies). `labels` come from the server's /codes/labels answer. */
export const sheetHtml = (labels, sizeKey, { fit = false } = {}) => {
  const size = SIZES[sizeKey] ?? SIZES['a4-24'];
  const all = labels.flatMap((l) => Array.from({ length: l.copies }, () => labelHtml(l, size)));
  const pageCount = size.kind === 'sheet' ? Math.max(1, Math.ceil(all.length / (size.cols * size.rows))) : all.length;
  const css = `
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff}
    ${size.kind === 'sheet' ? '@page{size:A4;margin:0}' : `@page{size:${size.w}mm ${size.h}mm;margin:0}`}
    .grid{${size.kind === 'sheet' ? `display:grid;grid-template-columns:repeat(${size.cols},${size.w}mm);grid-auto-rows:${size.h}mm;width:${size.cols * size.w}mm;margin:0 auto` : ''}}
    .label{width:${size.w}mm;height:${size.h}mm;padding:${size.h <= 25 ? 1 : 2}mm;overflow:hidden;display:flex;flex-direction:column;gap:.6mm;${size.kind === 'roll' ? 'page-break-after:always;' : 'page-break-inside:avoid;'}}
    .label.two{flex-direction:row;align-items:center;gap:2mm}
    .pic{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center}
    .label.two .pic{flex:0 0 ${Math.round(size.h * 0.8)}mm;max-width:50%}
    .pic svg{max-width:100%;max-height:100%;width:100%;height:auto}
    .txt{flex:0 0 auto;line-height:1.15;text-align:center}
    .label.two .txt{flex:1 1 auto;text-align:left}
    .name{font-weight:700;font-size:${size.h <= 25 ? 6.5 : 8.5}pt;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .sku,.batch{font-size:${size.h <= 25 ? 5.5 : 7}pt}
    .price{font-weight:700;font-size:${size.h <= 25 ? 8 : 11}pt}
    @media screen{body{background:#e5e7eb}.label{background:#fff;outline:1px dashed #cbd5e1}.grid{gap:0}}`;
  const body = size.kind === 'sheet' ? `<div class="grid">${all.join('')}</div>` : all.join('');

  // on screen only: shrink the page to the width of the preview box
  const fitScript = fit ? `<script>(function(){var w=${size.kind === 'sheet' ? size.cols * size.w : size.w}*3.7795;function f(){document.body.style.zoom=Math.min(1,(window.innerWidth-8)/w)}f();addEventListener('resize',f)})()</script>` : '';

  return { html: `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>${css}</style></head><body>${body}${fitScript}</body></html>`, count: all.length, pages: pageCount, size };
};

/** Send the labels to the printer through a hidden frame (so none of the app's own page is printed). */
export const printHtml = (html) => new Promise((resolve) => {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.srcdoc = html;
  frame.onload = () => {
    const win = frame.contentWindow;
    win.focus();
    win.print();
    setTimeout(() => { frame.remove(); resolve(); }, 1500);
  };
  document.body.appendChild(frame);
});
