// A small PDF writer for plain documents: real, selectable text in the standard Helvetica fonts (nothing embedded, so files stay small). No library needed.
// Text is written in WinAnsi, so a character outside it (some scripts and symbols) shows as "?"; the CSV and JSON files carry everything.

const SPECIAL = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };

/** A string made only of WinAnsi characters (as a "binary string": one char per byte), with the PDF's own escapes. */
const winAnsi = (s) => {
  let out = '';
  for (const ch of String(s ?? '')) {
    const c = ch.codePointAt(0);
    let b = '?';
    if (c === 9) b = ' ';
    else if (c >= 0x20 && c < 0x7f) b = ch;
    else if (c >= 0xa0 && c <= 0xff) b = ch;
    else if (SPECIAL[c]) b = String.fromCharCode(SPECIAL[c]);
    out += b === '(' || b === ')' || b === '\\' ? `\\${b}` : b;
  }

  return out;
};

const num = (n) => (Math.round(n * 100) / 100).toString();
const rgb = (c) => `${c.map((v) => num(v / 255)).join(' ')}`;

let measureCtx = null;
const ctx2d = () => { if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d'); return measureCtx; };

export class TextPdf {
  constructor({ width = 595.28, height = 841.89 } = {}) {
    this.W = width; this.H = height; this.pages = []; this.newPage();
  }

  newPage() { this.cur = []; this.pages.push(this.cur); }

  /** Width of a string in points (Arial and Helvetica share their metrics). */
  measure(str, size, bold = false) {
    const c = ctx2d();
    c.font = `${bold ? 'bold ' : ''}100px Helvetica, Arial, "Liberation Sans", sans-serif`;

    return (c.measureText(String(str ?? '')).width * size) / 100;
  }

  /** The string cut with … to fit a width. */
  fit(str, maxW, size, bold = false) {
    let s = String(str ?? '');
    if (this.measure(s, size, bold) <= maxW) return s;
    while (s.length > 1 && this.measure(`${s}…`, size, bold) > maxW) s = s.slice(0, -1);

    return `${s.trimEnd()}…`;
  }

  /** Words wrapped to a width; the last allowed line is cut with … when there is more. */
  wrap(str, maxW, size, bold = false, maxLines = 99) {
    const lines = []; let line = '';
    String(str ?? '').split(/\s+/).filter(Boolean).forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (line && this.measure(test, size, bold) > maxW) { lines.push(line); line = word; } else line = test;
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) { const kept = lines.slice(0, maxLines); kept[maxLines - 1] = this.fit(`${kept[maxLines - 1]} ${lines[maxLines]}…`, maxW, size, bold); return kept; }

    return lines;
  }

  /** y is the baseline, measured from the TOP of the page. */
  text(str, x, y, { size = 9, bold = false, color = [0, 0, 0], align = 'left' } = {}) {
    if (str === null || str === undefined || str === '') return;
    const w = align === 'left' ? 0 : this.measure(str, size, bold);
    const px = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    this.cur.push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${rgb(color)} rg 1 0 0 1 ${num(px)} ${num(this.H - y)} Tm (${winAnsi(str)}) Tj ET`);
  }

  rect(x, y, w, h, color) { this.cur.push(`${rgb(color)} rg ${num(x)} ${num(this.H - y - h)} ${num(w)} ${num(h)} re f`); }

  line(x1, y1, x2, y2, color = [0, 0, 0], width = 0.5) { this.cur.push(`${rgb(color)} RG ${num(width)} w ${num(x1)} ${num(this.H - y1)} m ${num(x2)} ${num(this.H - y2)} l S`); }

  /** @returns {Blob} */
  blob(title = '') {
    const enc = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
    const chunks = []; const offsets = [];
    let length = 0;
    const push = (s) => { const b = enc(s); chunks.push(b); length += b.length; };
    const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n${body}\nendobj\n`); };
    const n = this.pages.length;
    push('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Count ${n} /Kids [${this.pages.map((_, i) => `${6 + i * 2} 0 R`).join(' ')}] >>`);
    obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    obj(5, `<< /Title (${winAnsi(title).replace(/[^\x20-\x7e]/g, '')}) /Producer (TISL) >>`);
    this.pages.forEach((ops, i) => {
      const page = 6 + i * 2; const content = page + 1; const stream = ops.join('\n');
      obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.W)} ${num(this.H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`);
      obj(content, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });
    const total = 6 + n * 2; const xref = length;
    push(`xref\n0 ${total}\n0000000000 65535 f \n${Array.from({ length: total - 1 }, (_, i) => `${String(offsets[i + 1]).padStart(10, '0')} 00000 n \n`).join('')}`);
    push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF`);

    return new Blob(chunks, { type: 'application/pdf' });
  }
}
