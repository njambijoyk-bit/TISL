// A PDF of picture pages, built one page at a time so a long catalogue never holds more than its JPEG bytes. Each page is an A4 sheet filled by its picture. No library needed.
const enc = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

export class JpegPdf {
  constructor(title = '') { this.title = title; this.pages = []; }

  /** @param {Uint8Array} bytes a JPEG */
  add(bytes, w, h) { this.pages.push({ bytes, w, h }); }

  blob() {
    const A4 = [595.28, 841.89]; const chunks = []; const offsets = [];
    let length = 0;
    const push = (b) => { const bytes = typeof b === 'string' ? enc(b) : b; chunks.push(bytes); length += bytes.length; };
    const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n${body}\nendobj\n`); };
    const n = this.pages.length;
    push('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Count ${n} /Kids [${this.pages.map((_, i) => `${4 + i * 3} 0 R`).join(' ')}] >>`);
    obj(3, `<< /Title (${this.title.replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '')}) /Producer (TISL) >>`);
    this.pages.forEach((p, i) => {
      const page = 4 + i * 3; const content = page + 1; const image = page + 2;
      obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`);
      const stream = `q ${A4[0]} 0 0 ${A4[1]} 0 0 cm /Im0 Do Q`;
      obj(content, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      offsets[image] = length;
      push(`${image} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`);
      push(p.bytes);
      push('\nendstream\nendobj\n');
    });
    const total = 4 + n * 3; const xref = length;
    push(`xref\n0 ${total}\n0000000000 65535 f \n${Array.from({ length: total - 1 }, (_, i) => `${String(offsets[i + 1]).padStart(10, '0')} 00000 n \n`).join('')}`);
    push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF`);

    return new Blob(chunks, { type: 'application/pdf' });
  }
}
