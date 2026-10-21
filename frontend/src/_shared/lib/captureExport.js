/**
 * Save what is on the page as a JPEG or a PDF, all in the browser. The element is drawn as it looks, with a title line added on top.
 * html2canvas does not understand modern colour functions (color-mix, color(), oklch), so every colour in the copy it draws is first turned into plain rgb.
 */

const COLOR_PROPS = ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor', 'textDecorationColor', 'fill', 'stroke'];

function rgbOf(ctx, value) {
  if (!value || value === 'transparent') return 'rgba(0, 0, 0, 0)';
  try {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
  } catch { return value; }
}

const saveBlob = (blob, filename) => {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
};

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function exportElement(el, { name, title, subtitle, format = 'pdf' }) {
  const { default: html2canvas } = await import('html2canvas');
  const pix = document.createElement('canvas'); pix.width = 1; pix.height = 1;
  const ctx = pix.getContext('2d', { willReadFrequently: true });
  const page = rgbOf(ctx, getComputedStyle(document.body).backgroundColor);
  // the widest the content really is: a scrolling child (the map) can be wider than the box around it
  const box = el.getBoundingClientRect();
  const pad = 24;
  const content = Math.ceil([el, ...el.querySelectorAll('*')].reduce((w, n) => Math.max(w, n.getBoundingClientRect().left - box.left + (Math.max(n.scrollWidth || 0, n.offsetWidth || 0) || n.getBoundingClientRect().width)), el.offsetWidth));
  const total = content + pad * 2;

  const canvas = await html2canvas(el, {
    scale: 2, useCORS: true, logging: false, backgroundColor: page, width: total, windowWidth: Math.ceil(box.left) + total + 80,
    onclone: (doc, root) => {
      const view = doc.defaultView;
      root.style.width = `${content}px`;
      root.style.padding = `${pad}px`;
      root.style.boxSizing = 'content-box';
      [root, ...root.querySelectorAll('*')].forEach((n) => {
        const cs = view.getComputedStyle(n);
        COLOR_PROPS.forEach((p) => { if (cs[p]) n.style[p] = rgbOf(ctx, cs[p]); });
        if (cs.overflowX !== 'visible') { n.style.overflow = 'visible'; }
        if (cs.boxShadow && cs.boxShadow !== 'none') n.style.boxShadow = 'none';
        if (cs.backgroundImage && cs.backgroundImage.includes('color')) n.style.backgroundImage = 'none';
      });
      const head = doc.createElement('div');
      head.style.cssText = `margin:0 0 16px;font-family:inherit;color:${rgbOf(ctx, getComputedStyle(document.body).color)}`;
      head.innerHTML = `<div style="font-size:22px;font-weight:800">${esc(title)}</div><div style="font-size:12px;opacity:.7;margin-top:2px">${esc(subtitle)}</div>`;
      root.insertBefore(head, root.firstChild);
    },
  });

  if (format === 'jpeg') {
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
    saveBlob(blob, `${name}.jpg`);
    return;
  }

  // PDF: the picture fitted to the page width, cut into as many pages as it needs
  const { jsPDF } = await import('jspdf');
  const landscape = canvas.width >= canvas.height;
  const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const m = 24;
  const scale = (pw - m * 2) / canvas.width;
  const sliceH = Math.floor((ph - m * 2) / scale);   // source pixels per page
  for (let y = 0, i = 0; y < canvas.height; y += sliceH, i += 1) {
    const h = Math.min(sliceH, canvas.height - y);
    const part = document.createElement('canvas');
    part.width = canvas.width; part.height = h;
    const pc = part.getContext('2d');
    pc.fillStyle = page; pc.fillRect(0, 0, part.width, part.height);
    pc.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (i) pdf.addPage();
    pdf.setFillColor(...(page.match(/\d+/g) ?? [255, 255, 255]).slice(0, 3).map(Number));
    pdf.rect(0, 0, pw, ph, 'F');
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', m, m, canvas.width * scale, h * scale);
  }
  pdf.save(`${name}.pdf`);
}
