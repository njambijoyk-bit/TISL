// A minimal PDF writer: each page is a JPEG picture filling an A4 page. No library needed.
const enc = (s) => new TextEncoder().encode(s);

const dataUrlToBytes = (url) => {
  const bin = atob(url.split(',')[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);

  return out;
};

/** @param {HTMLCanvasElement[]} canvases  @returns {Blob} a PDF with one A4 page per canvas */
export function pdfFromCanvases(canvases, quality = 0.9) {
  const A4 = [595.28, 841.89];
  const chunks = []; const offsets = [];
  let length = 0;
  const push = (b) => { const bytes = typeof b === 'string' ? enc(b) : b; chunks.push(bytes); length += bytes.length; };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n${body}\nendobj\n`); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = canvases.length;
  // objects: 1 catalog, 2 pages, then for each page: page, content, image
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${canvases.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`);
  canvases.forEach((cv, i) => {
    const page = 3 + i * 3; const content = page + 1; const image = page + 2;
    const jpeg = dataUrlToBytes(cv.toDataURL('image/jpeg', quality));
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`);
    const stream = `q ${A4[0]} 0 0 ${A4[1]} 0 0 cm /Im0 Do Q`;
    obj(content, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    offsets[image] = length;
    push(`${image} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg);
    push('\nendstream\nendobj\n');
  });
  const total = 3 + n * 3;
  const xref = length;
  push(`xref\n0 ${total}\n0000000000 65535 f \n${Array.from({ length: total - 1 }, (_, i) => `${String(offsets[i + 1]).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);

  return new Blob(chunks, { type: 'application/pdf' });
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
