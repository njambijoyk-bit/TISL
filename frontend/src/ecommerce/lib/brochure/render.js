import { FONT_STYLES, SVG_STICKERS, loadMoodboardFonts } from '../../../campaigns/lib/moodboardKit';
import { clipShape, cover, drawPattern, drawSticker, loadImage } from '../../../campaigns/lib/moodboardExport';
import { storageUrl } from '../../../_shared/lib/storageUrl';
import { TEMPLATES } from './templates';
import { brochureFields } from './fields';

// Draws a brochure onto canvases, one per page, from a template and the service's data.

export const fontOf = (key, size, extra = {}) => {
  const f = FONT_STYLES[key] ?? FONT_STYLES.sans;
  return { css: `${extra.weight ?? f.weight} ${size}px ${f.family}`, spacing: f.spacing, upper: f.upper };
};

export const setFont = (ctx, key, size, weight) => {
  const f = fontOf(key, size, { weight });
  ctx.font = f.css;
  if ('letterSpacing' in ctx) ctx.letterSpacing = f.spacing ? `${parseFloat(f.spacing) * size}px` : '0px';

  return f;
};

/** Words wrapped to a width, using the font that is set on the context. */
export const wrapLines = (ctx, text, maxW) => {
  const lines = [];
  String(text).split(/\n+/).forEach((para) => {
    let line = '';
    para.split(/\s+/).filter(Boolean).forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = word; } else line = test;
    });
    if (line) lines.push(line);
  });

  return lines;
};

export const ellipsize = (ctx, line, maxW) => {
  if (ctx.measureText(line).width <= maxW) return line;
  let l = line;
  while (l.length > 1 && ctx.measureText(`${l}…`).width > maxW) l = l.slice(0, -1);

  return `${l.trimEnd()}…`;
};

/** One field in a box: the biggest size up to `sizePx` at which it fits, then cut with … if it still does not. */
export function drawText(ctx, text, box, o) {
  const f = FONT_STYLES[o.font] ?? FONT_STYLES.sans;
  const content = f.upper ? String(text).toUpperCase() : String(text);
  const maxSize = o.sizePx; const minSize = Math.min(maxSize, Math.max(8, maxSize * (o.oneLine ? 0.3 : 0.55)));
  let size = maxSize; let lines = [];
  for (; size >= minSize; size -= Math.max(0.5, maxSize * 0.03)) {
    setFont(ctx, o.font, size, o.weight);
    lines = wrapLines(ctx, content, box.w);
    if (lines.length * size * 1.22 <= box.h && (!o.oneLine || lines.length === 1)) break;
  }
  setFont(ctx, o.font, size, o.weight);
  const lh = size * 1.22;
  const fit = Math.max(1, Math.floor(box.h / lh));
  if (lines.length > fit) { lines = lines.slice(0, fit); lines[fit - 1] = ellipsize(ctx, `${lines[fit - 1]}…`, box.w); }
  ctx.fillStyle = o.color; ctx.textBaseline = 'top';
  const align = o.align ?? 'left';
  ctx.textAlign = align;
  const x = align === 'center' ? box.w / 2 : align === 'right' ? box.w : 0;
  const offY = o.vcenter ? Math.max(0, (box.h - lines.length * lh) / 2) : 0;
  lines.forEach((l, i) => ctx.fillText(l, x, offY + i * lh));
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/** Sections that stack down a box, any empty one skipped, the whole thing shrunk until it fits and then cut. */
function drawStack(ctx, items, box, o, fields) {
  const sections = items.map((it) => ({ ...it, value: fields[it.field] })).filter((it) => (Array.isArray(it.value) ? it.value.length : String(it.value ?? '').trim()));
  if (!sections.length) return;
  const base = o.sizePx;
  const bulletW = o.bullet ? base * 1.1 : 0;

  const layout = (scale) => {
    const size = base * scale; const ts = size * 0.95; const gap = size * 0.9;
    const rows = [];
    let y = 0;
    sections.forEach((sec, i) => {
      setFont(ctx, o.titleFont ?? o.font, ts, undefined);
      const title = (FONT_STYLES[o.titleFont ?? o.font]?.upper ? sec.title.toUpperCase() : sec.title);
      rows.push({ type: 'title', text: title, y, size: ts }); y += ts * 1.5;
      setFont(ctx, o.font, size, 400);
      if (sec.kind === 'text') {
        wrapLines(ctx, sec.value, box.w).forEach((l) => { rows.push({ type: 'line', text: l, y, size }); y += size * 1.3; });
      } else {
        sec.value.forEach((v) => {
          const ls = wrapLines(ctx, v, box.w - bulletW);
          ls.forEach((l, j) => { rows.push({ type: 'line', text: l, y, size, bullet: j === 0 && o.bullet ? o.bullet : null, indent: bulletW }); y += size * 1.3; });
          y += size * 0.2;
        });
      }
      if (i < sections.length - 1) y += gap;
    });

    return { rows, height: y, size };
  };

  let scale = 1; let res = layout(scale);
  while (res.height > box.h && scale > 0.5) { scale -= 0.04; res = layout(scale); }
  const maxRows = res.rows.filter((r) => r.y + r.size * 1.3 <= box.h + 0.5);
  const cut = maxRows.length < res.rows.length;
  maxRows.forEach((r, i) => {
    if (r.type === 'title') { setFont(ctx, o.titleFont ?? o.font, r.size, undefined); ctx.fillStyle = o.accent; ctx.fillText(r.text, 0, r.y); return; }
    setFont(ctx, o.font, r.size, 400); ctx.fillStyle = o.color;
    if (r.bullet) { ctx.fillStyle = o.accent; ctx.fillText(r.bullet, 0, r.y); ctx.fillStyle = o.color; }
    const last = cut && i === maxRows.length - 1;
    ctx.fillText(last ? ellipsize(ctx, `${r.text}…`, box.w - (r.indent ?? 0)) : r.text, r.indent ?? 0, r.y);
  });
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/**
 * A table with a title, a header row and one line per row: the packages with their own prices and where they are offered. A column nobody has a value for is left out;
 * when the rows do not fit, the text shrinks first and then the last ones are replaced by "...and N more".
 */
function drawTable(ctx, rows, box, o) {
  const cols = o.columns.filter((c) => rows.some((r) => String(r[c.key] ?? '').trim()));
  if (!cols.length || !rows.length) return;
  const sum = cols.reduce((s, c) => s + c.w, 0); const pad = o.sizePx * 0.5;
  let x = 0;
  const at = cols.map((c) => { const left = x; x += (box.w * c.w) / sum; return { ...c, left, width: (box.w * c.w) / sum }; });
  const titleH = o.sizePx * 2; const headH = o.sizePx * 1.5;
  drawText(ctx, o.title, { w: box.w, h: titleH }, { font: o.titleFont, sizePx: o.sizePx * 0.95, color: o.accent, oneLine: true });
  const cell = (text, c, y, h, opts) => {
    ctx.save(); ctx.translate(c.left + (c.align === 'right' ? 0 : pad * 0.3), y);
    drawText(ctx, text, { w: c.width - pad, h }, { font: 'sans', color: o.color, align: c.align === 'right' ? 'right' : 'left', oneLine: true, vcenter: true, ...opts });
    ctx.restore();
  };
  at.forEach((c) => cell(c.label.toUpperCase(), c, titleH, headH, { sizePx: o.sizePx * 0.62, weight: 700, color: o.muted }));
  const top = titleH + headH;
  ctx.strokeStyle = o.rule; ctx.lineWidth = Math.max(1, o.sizePx * 0.06); ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(box.w, top); ctx.stroke();
  const avail = box.h - top; const minRow = o.sizePx * 1.5;
  const fit = Math.max(1, Math.floor(avail / minRow));
  const shown = rows.length > fit ? rows.slice(0, Math.max(1, fit - 1)) : rows;
  const rh = Math.min(o.sizePx * 2.7, avail / (shown.length + (rows.length > shown.length ? 1 : 0)));
  shown.forEach((r, n) => {
    const y = top + n * rh;
    at.forEach((c) => cell(r[c.key] ?? '', c, y, rh, { sizePx: Math.min(o.sizePx, rh * 0.62), weight: c.key === 'name' || c.key === 'total' ? 700 : 400 }));
    if (n < shown.length - 1 || rows.length > shown.length) { ctx.save(); ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.moveTo(0, y + rh); ctx.lineTo(box.w, y + rh); ctx.stroke(); ctx.restore(); }
  });
  if (rows.length > shown.length) cell(`…and ${rows.length - shown.length} more`, at[0], top + shown.length * rh, rh, { sizePx: Math.min(o.sizePx * 0.85, rh * 0.55), color: o.muted });
}

function drawChip(ctx, text, box, o) {
  const r = box.h / 2;
  ctx.fillStyle = o.bg; ctx.beginPath(); ctx.roundRect(0, 0, box.w, box.h, r); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, box.w, box.h, r); ctx.clip();
  ctx.translate(box.w * 0.06, 0);
  drawText(ctx, text, { w: box.w * 0.88, h: box.h }, { font: o.font, sizePx: Math.min(o.sizePx, box.h * 0.5), color: o.color, align: 'center', vcenter: true, oneLine: true });
  ctx.restore();
}

const empty = (v) => (Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim());

/**
 * @returns {Promise<HTMLCanvasElement[]>} one canvas per page, A4 at `width` pixels wide
 */
export async function renderBrochure(data, templateKey, deps, { width = 1240 } = {}) {
  const tpl = TEMPLATES[templateKey] ?? TEMPLATES.classic;
  const fields = brochureFields(data, deps);
  const W = width; const H = Math.round((W * 297) / 210);
  loadMoodboardFonts();
  const fontKeys = new Set(tpl.pages.flatMap((pg) => pg.slots.flatMap((s) => [s.font, s.titleFont].filter(Boolean))));
  try { await Promise.all([...fontKeys].map((k) => document.fonts.load(`${FONT_STYLES[k]?.weight ?? 400} 40px ${FONT_STYLES[k]?.family}`))); } catch { /* system fonts will do */ }

  // pictures, loaded once
  const urls = { main: data.image_main, logo: deps.company?.logo_view ?? null };
  (data.image_others ?? []).forEach((u, i) => { urls[`other:${i}`] = u; });
  const imgs = {};
  await Promise.all(Object.entries(urls).filter(([, u]) => u).map(async ([key, u]) => { imgs[key] = await loadImage(String(u).startsWith('data:') ? u : storageUrl(u)); }));

  return tpl.pages.map((pg) => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = pg.background; ctx.fillRect(0, 0, W, H);
    drawPattern(ctx, pg.pattern, pg.background, W, H);

    [...pg.slots].map((s, i) => [s, i]).sort((a, b) => ((a[0].z ?? 1) - (b[0].z ?? 1)) || (a[1] - b[1])).forEach(([s]) => {
      if (s.need && empty(fields[s.need])) return;
      if (s.kind === 'text' && empty(fields[s.field])) return;
      const x = (s.x / 100) * W; const y = (s.y / 100) * H; const w = (s.w / 100) * W; const h = (s.h / 100) * H;
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2); ctx.rotate(((s.rot ?? 0) * Math.PI) / 180); ctx.translate(-w / 2, -h / 2);
      const sizePx = ((s.size ?? 1.6) / 100) * W;
      if (s.kind === 'rule') {
        ctx.strokeStyle = s.color ?? '#000'; ctx.lineWidth = Math.max(1, ((s.width ?? 0.15) / 100) * W); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.stroke();
      } else if (s.kind === 'block') {
        ctx.save(); clipShape(ctx, s.shape, w, h, W);
        if (s.fill && s.fill !== 'transparent') { ctx.fillStyle = s.fill; ctx.fillRect(0, 0, w, h); }
        ctx.restore();
        if (s.border) { ctx.strokeStyle = s.border.color; ctx.lineWidth = Math.max(1, (s.border.width / 100) * W); ctx.strokeRect(0, 0, w, h); }
      } else if (s.kind === 'photo') {
        const img = imgs[s.src];
        if (!img) { ctx.restore(); return; }
        if (s.shape === 'polaroid' || s.rot) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 0.02 * W; ctx.shadowOffsetY = 0.008 * W; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.restore(); }
        ctx.save(); clipShape(ctx, s.shape, w, h, W);
        if (s.shape === 'polaroid') {
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
          const pad = 0.04 * w; const ih = h - pad - 0.16 * w;
          ctx.beginPath(); ctx.rect(pad, pad, w - 2 * pad, ih); ctx.clip(); cover(ctx, img, pad, pad, w - 2 * pad, ih);
        } else if (s.src === 'logo') {
          const r = Math.min(w / img.width, h / img.height); ctx.drawImage(img, 0, 0, img.width * r, img.height * r);
        } else cover(ctx, img, 0, 0, w, h);
        ctx.restore();
      } else if (s.kind === 'sticker') {
        if (String(s.value).startsWith('svg:') && !SVG_STICKERS[String(s.value).slice(4)]) { ctx.restore(); return; }
        drawSticker(ctx, { value: s.value, color: s.color }, w, h);
      } else if (s.kind === 'text') {
        drawText(ctx, fields[s.field], { w, h }, { font: s.font, sizePx, color: s.color, align: s.align, weight: s.weight });
      } else if (s.kind === 'chip') {
        drawChip(ctx, fields[s.field], { w, h }, { bg: s.bg, color: s.color, font: s.font, sizePx });
      } else if (s.kind === 'table') {
        drawTable(ctx, fields[s.field], { w, h }, { columns: s.columns, title: s.title, sizePx, color: s.color, accent: s.accent, muted: s.muted ?? s.color, rule: s.rule ?? s.accent, titleFont: s.titleFont });
      } else if (s.kind === 'stack') {
        drawStack(ctx, s.items, { w, h }, { sizePx, color: s.color, accent: s.accent, font: s.font, titleFont: s.titleFont, bullet: s.bullet }, fields);
      }
      ctx.restore();
    });

    return cv;
  });
}
