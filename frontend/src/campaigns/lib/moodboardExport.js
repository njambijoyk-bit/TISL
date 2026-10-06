import { storageUrl } from '../../_shared/lib/storageUrl';
import { FONT_STYLES, SVG_STICKERS, TORN } from './moodboardKit';

const lum = (hex) => { const n = parseInt((hex || '#ffffff').slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
export const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

/** Corner radii of a shape as [horizontal, vertical] pairs (top-left, top-right, bottom-right, bottom-left), in pixels. */
export function corners(shape, w, h, W) {
  const e = (rx, ry) => ({ x: rx, y: ry });
  switch (shape) {
    case 'circle': return [e(w / 2, h / 2), e(w / 2, h / 2), e(w / 2, h / 2), e(w / 2, h / 2)];
    case 'rounded': return Array(4).fill(e(0.03 * W, 0.03 * W));
    case 'polaroid': return Array(4).fill(e(0.006 * W, 0.006 * W));
    case 'pill': return Array(4).fill(e(0.06 * W, 0.06 * W));
    case 'corner': return [e(0, 0), e(0.16 * W, 0.16 * W), e(0, 0), e(0, 0)];
    case 'arch': return [e(w / 2, 0.28 * h), e(w / 2, 0.28 * h), e(0, 0), e(0, 0)];
    case 'blob': return [e(0.58 * w, 0.48 * h), e(0.42 * w, 0.56 * h), e(0.55 * w, 0.44 * h), e(0.45 * w, 0.52 * h)];
    default: return null;
  }
}

/** Trace a slot's outline (0,0 to w,h) and clip to it. */
export function clipShape(ctx, shape, w, h, W) {
  ctx.beginPath();
  if (shape === 'torn') {
    TORN.slice(8, -1).split(',').forEach((pt, i) => {
      const [px, py] = pt.trim().split(/\s+/).map((v) => (parseFloat(v) / 100));
      if (i === 0) ctx.moveTo(px * w, py * h); else ctx.lineTo(px * w, py * h);
    });
    ctx.closePath();
  } else if (corners(shape, w, h, W)) {
    ctx.roundRect(0, 0, w, h, corners(shape, w, h, W));
  } else {
    ctx.rect(0, 0, w, h);
  }
  ctx.clip();
}

export function cover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height);
  const sw = w / r; const sh = h / r;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

export function wrap(ctx, text, maxW) {
  const lines = []; let line = '';
  String(text).split(/\s+/).forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = word; } else line = test;
  });
  if (line) lines.push(line);

  return lines;
}

export function drawPattern(ctx, pattern, bg, W, H) {
  const ink = lum(bg) > 0.5 ? '0,0,0' : '255,255,255';
  const cell = 0.032 * W;
  ctx.save();
  if (pattern === 'grid') {
    ctx.strokeStyle = `rgba(${ink},0.09)`; ctx.lineWidth = Math.max(1, W / 1500);
    for (let x = 0; x <= W; x += cell) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += cell) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  } else if (pattern === 'dots') {
    ctx.fillStyle = `rgba(${ink},0.22)`;
    for (let y = cell / 2; y < H; y += cell) for (let x = cell / 2; x < W; x += cell) { ctx.beginPath(); ctx.arc(x, y, Math.max(1.2, W / 1400), 0, Math.PI * 2); ctx.fill(); }
  } else if (pattern === 'lines') {
    ctx.strokeStyle = `rgba(${ink},0.14)`; ctx.lineWidth = Math.max(1, W / 1500);
    for (let y = cell * 1.4; y <= H; y += cell * 1.4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  } else if (pattern === 'paper') {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < W * H / 260; i++) { ctx.fillStyle = `rgba(${ink},${(0.02 + rnd() * 0.05).toFixed(3)})`; ctx.fillRect(rnd() * W, rnd() * H, 1.4, 1.4); }
  }
  ctx.restore();
}

function drawText(ctx, c, w, h, W) {
  const f = FONT_STYLES[c.font] ?? FONT_STYLES.sans;
  const size = Math.max(0.016 * W, 0.62 * h);
  ctx.font = `${f.weight} ${size}px ${f.family}`;
  ctx.fillStyle = c.color || '#222222';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  if (f.spacing && 'letterSpacing' in ctx) ctx.letterSpacing = `${parseFloat(f.spacing) * size}px`;
  const text = f.upper ? String(c.text).toUpperCase() : String(c.text);
  const lines = wrap(ctx, text, w);
  const lh = size * 1.1;
  const top = h / 2 - (lines.length * lh) / 2 + lh / 2;
  lines.forEach((l, i) => ctx.fillText(l, 0, top + i * lh));
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

export function drawSticker(ctx, c, w, h) {
  if (String(c.value).startsWith('svg:')) {
    const def = SVG_STICKERS[String(c.value).slice(4)];
    if (!def) return;
    const sc = Math.min(w, h) / 100;
    ctx.translate((w - 100 * sc) / 2, (h - 100 * sc) / 2); ctx.scale(sc, sc);
    const col = c.color || '#222222';
    def.paths.forEach((p) => {
      const path = new Path2D(p.d);
      if (def.tape || p.fill) { ctx.save(); ctx.globalAlpha = def.tape ? 0.55 : 1; ctx.fillStyle = col; ctx.fill(path); ctx.restore(); }
      if (!def.tape) { ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash(p.dash ? p.dash.split(' ').map(Number) : []); ctx.stroke(path); }
    });
    return;
  }
  ctx.font = `${Math.min(w, h) * 0.85}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(c.value, w / 2, h / 2 + Math.min(w, h) * 0.06);
}

/**
 * Draw a moodboard ({ layout, contents }, photo spots carrying `image`) onto a canvas and save it as a PNG. Throws if a picture cannot be read
 * (the picture's server must allow it); the caller shows the message. With `respectNoDownload`, a picture whose pin is set to "no download" is left out; the
 * result says how many were left out ({ skipped }).
 */
export async function downloadMoodboardImage(board, name = 'moodboard', width = 2000, { respectNoDownload = false } = {}) {
  const layout = board.layout; const ratio = layout.ratio ?? [4, 5];
  const W = width; const H = Math.round((W * ratio[1]) / ratio[0]);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const fonts = new Set(Object.values(board.contents ?? {}).filter((c) => c?.text).map((c) => FONT_STYLES[c.font] ?? FONT_STYLES.sans));
  try { await Promise.all([...fonts].map((f) => document.fonts.load(`${f.weight} 40px ${f.family}`))); } catch { /* fall back to system fonts */ }
  const photos = {};
  const skipped = new Set(respectNoDownload ? Object.entries(board.contents ?? {}).filter(([, c]) => c?.image && c.download === false).map(([id]) => id) : []);
  await Promise.all(Object.entries(board.contents ?? {}).filter(([id, c]) => c?.image && !skipped.has(id)).map(async ([id, c]) => { photos[id] = await loadImage(storageUrl(c.image)); }));

  ctx.fillStyle = layout.background || '#ffffff'; ctx.fillRect(0, 0, W, H);
  drawPattern(ctx, layout.pattern, layout.background, W, H);

  [...layout.slots].map((s, i) => [s, i]).sort((a, b) => ((a[0].z || 1) - (b[0].z || 1)) || (a[1] - b[1])).forEach(([slot]) => {
    const c = board.contents?.[slot.id];
    if (!c || !Object.keys(c).length || skipped.has(slot.id)) return;
    const w = (slot.w / 100) * W; const h = (slot.h / 100) * H;
    ctx.save();
    ctx.translate((slot.x / 100) * W + w / 2, (slot.y / 100) * H + h / 2); ctx.rotate(((slot.rot || 0) * Math.PI) / 180); ctx.translate(-w / 2, -h / 2);
    if (slot.type === 'sticker') drawSticker(ctx, c, w, h);
    else {
      if (slot.type === 'photo' && (slot.rot || slot.shape === 'polaroid')) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 0.02 * W; ctx.shadowOffsetY = 0.008 * W; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.restore(); }
      clipShape(ctx, slot.shape, w, h, W);
      if (slot.type === 'photo') {
        const img = photos[slot.id];
        if (slot.shape === 'polaroid') {
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
          const pad = 0.04 * w; const ih = h - pad - 0.16 * w;
          ctx.fillStyle = '#d6d3d1'; ctx.fillRect(pad, pad, w - 2 * pad, ih);
          if (img) { ctx.save(); ctx.beginPath(); ctx.rect(pad, pad, w - 2 * pad, ih); ctx.clip(); cover(ctx, img, pad, pad, w - 2 * pad, ih); ctx.restore(); }
        } else if (img) cover(ctx, img, 0, 0, w, h);
        else { ctx.fillStyle = '#d6d3d1'; ctx.fillRect(0, 0, w, h); }
      } else if (slot.type === 'color') {
        ctx.fillStyle = c.value; ctx.fillRect(0, 0, w, h);
        if (c.label) {
          ctx.font = `700 ${Math.min(0.02 * W, h * 0.18)}px system-ui, sans-serif`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
          ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 0.006 * W; ctx.fillText(c.label, w / 2, h - 0.008 * W);
        }
      } else if (slot.type === 'text') drawText(ctx, c, w, h, W);
    }
    ctx.restore();
  });

  const blob = await new Promise((resolve, reject) => { try { canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('empty'))), 'image/png'); } catch (e) { reject(e); } });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${String(name).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'moodboard'}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  return { skipped: skipped.size };
}
