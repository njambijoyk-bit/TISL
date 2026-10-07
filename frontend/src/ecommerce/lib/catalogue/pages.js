import { fmtDate } from '../priceList/format';
import { line, panel, photo, txt } from './draw';
import { SECTIONS, drawCompact, leadTheme } from './sections';
import { themeOf } from './themes';

// Pages: a cover, a contents list, the entry pages (one full-page entry, two half-page entries, or six cards), and a back page.
// All drawn on one reusable canvas; the caller turns each finished page into a picture and moves on, so a big catalogue never holds its pages in memory.

export const PAGE_RATIO = 297 / 210;
const MARGIN = 3; const GAP = 1.4; const FOOT = 3.2;   // in units of one percent of the page width

export function newPage(width) {
  const cv = document.createElement('canvas');
  cv.width = width; cv.height = Math.round(width * PAGE_RATIO);
  const ctx = cv.getContext('2d');

  return { cv, ctx, W: cv.width, H: cv.height, u: cv.width / 100, imgs: {} };
}

export function clearPage(c, color = '#ffffff') { c.ctx.fillStyle = color; c.ctx.fillRect(0, 0, c.W, c.H); }

/**
 * Heights for sections down a page. Each wants a height and has a least it can do with. Too much wanted: they shrink together, each only down to its least.
 * Too little: the picture sections (`grow`) take what is left, so the page is always filled.
 * @param {{want:number,min:number,grow?:boolean}[]} defs
 */
export function allocate(defs, avail) {
  const want = defs.map((d) => d.want); const total = want.reduce((s, x) => s + x, 0);
  if (total <= avail) {
    const growers = defs.map((d, i) => (d.grow ? i : -1)).filter((i) => i >= 0);
    const pool = growers.length ? growers : defs.map((_, i) => i);
    const base = pool.reduce((s, i) => s + want[i], 0);

    return want.map((w, i) => (pool.includes(i) ? w + ((avail - total) * w) / base : w));
  }
  const room = defs.map((d, i) => Math.max(0, want[i] - d.min)); const capacity = room.reduce((s, x) => s + x, 0); const need = total - avail;
  if (need <= capacity) return want.map((w, i) => w - (need * room[i]) / capacity);

  return want.map((w) => (w * avail) / total);
}

function footer(c, company, pageNo, dark = false) {
  const { u, W, H } = c; const color = dark ? '#a7a39a' : '#9ca3af';
  txt(c, company?.name ?? '', MARGIN * u, H - (FOOT - 0.4) * u, W * 0.6, u * 1.6, { sizePx: u * 1, color, oneLine: true });
  txt(c, String(pageNo), W - MARGIN * u - W * 0.2, H - (FOOT - 0.4) * u, W * 0.2, u * 1.6, { sizePx: u * 1, color, align: 'right', oneLine: true });
}

/** One entry on a page of its own: its sections stacked down the page, each in its own theme. */
export function drawFullEntry(c, item, company, pageNo) {
  clearPage(c);
  const { u, W, H } = c;
  const parts = item.sections.map((s) => ({ s, def: SECTIONS[item.type]?.[s.key] })).filter((p) => p.def && p.def.has(item));
  if (!parts.length) parts.push({ s: { key: 'hero', theme: 'paper' }, def: SECTIONS[item.type]?.hero ?? SECTIONS.product.hero });
  const top = MARGIN * u; const avail = H - top - (MARGIN + FOOT - 1) * u - (parts.length - 1) * GAP * u;
  const hs = allocate(parts.map((p) => ({ want: p.def.want(item) * u, min: p.def.min(item) * u, grow: p.def.grow })), avail);
  let y = top;
  parts.forEach((p, i) => { p.def.draw(c, { x: MARGIN * u, y, w: W - 2 * MARGIN * u, h: hs[i] }, item, themeOf(p.s.theme)); y += hs[i] + GAP * u; });
  footer(c, company, pageNo);
}

/** Half-page entries (two to a page) and cards (six to a page, two across). */
export function drawSmallPage(c, entries, size, company, pageNo) {
  clearPage(c);
  const { u, W, H } = c; const top = MARGIN * u; const areaH = H - top - (MARGIN + FOOT - 1) * u; const areaW = W - 2 * MARGIN * u;
  const cols = size === 'card' ? 2 : 1; const rows = size === 'card' ? 3 : 2; const gap = GAP * u;
  const w = (areaW - gap * (cols - 1)) / cols; const h = (areaH - gap * (rows - 1)) / rows;
  entries.forEach((item, n) => {
    const col = n % cols; const row = Math.floor(n / cols);
    drawCompact(c, { x: MARGIN * u + col * (w + gap), y: top + row * (h + gap), w, h }, item, size, themeOf(leadTheme(item.sections)));
  });
  footer(c, company, pageNo);
}

/** The cover: up to four of the pictures, the title, the subtitle and the date. */
export function drawCover(c, brochure, company, pics, logo) {
  const th = themeOf('night'); const { u, W, H } = c;
  clearPage(c, th.bg);
  panel(c, { x: 0, y: 0, w: W, h: H }, th, 0);
  const area = { x: MARGIN * 2 * u, y: MARGIN * 2 * u, w: W - MARGIN * 4 * u, h: H * 0.5 };
  const shots = pics.slice(0, 4);
  if (shots.length) {
    const cols = shots.length === 1 ? 1 : 2; const rows = Math.ceil(shots.length / cols); const g = u * 1.2;
    const w = (area.w - g * (cols - 1)) / cols; const h = (area.h - g * (rows - 1)) / rows;
    shots.forEach((im, n) => photo(c, im, { x: area.x + (n % cols) * (w + g), y: area.y + Math.floor(n / cols) * (h + g), w: shots.length === 3 && n === 2 ? area.w : w, h }, th, brochure.title, 1.4));
  }
  let y = area.y + area.h + u * 5;
  line(c, area.x, y, area.x + u * 12, y, th.accent, 4); y += u * 3;
  txt(c, brochure.title, area.x, y, area.w, u * 16, { font: 'headline', sizePx: u * 6.5, color: th.ink }); y += u * 17;
  txt(c, brochure.subtitle, area.x, y, area.w, u * 6, { font: 'elegant', sizePx: u * 2.6, color: th.muted }); y += u * 7;
  txt(c, `Prices as at ${fmtDate(new Date())}`, area.x, y, area.w, u * 2.4, { sizePx: u * 1.5, color: th.accent, weight: 700, oneLine: true });
  const by = H - MARGIN * 2 * u - u * 5;
  if (logo) { const r = Math.min((u * 14) / logo.width, (u * 6) / logo.height); c.ctx.drawImage(logo, area.x, by - u * 0.5, logo.width * r, logo.height * r); txt(c, company?.name, area.x + logo.width * r + u * 2, by, area.w * 0.6, u * 4, { font: 'wide', sizePx: u * 1.4, color: th.ink, oneLine: true, vcenter: true }); } else txt(c, company?.name, area.x, by, area.w, u * 4, { font: 'wide', sizePx: u * 1.4, color: th.ink, oneLine: true });
}

/** One page of the contents list: the number, the name, and the page it is on. */
export function drawContents(c, rows, startNo, company, pageNo, first) {
  const th = themeOf('paper'); const { u, W, H } = c;
  clearPage(c, th.bg); panel(c, { x: 0, y: 0, w: W, h: H }, th, 0);
  let y = MARGIN * 2 * u;
  if (first) { txt(c, 'Contents', MARGIN * 2 * u, y, W * 0.6, u * 7, { font: 'headline', sizePx: u * 4.2, color: th.ink, oneLine: true }); y += u * 9; }
  const rh = u * 3.5; const x = MARGIN * 2 * u; const w = W - MARGIN * 4 * u;
  rows.forEach((r, n) => {
    const yy = y + n * rh;
    txt(c, String(startNo + n), x, yy, u * 4, rh, { sizePx: u * 1.3, color: th.accent, weight: 700, oneLine: true, vcenter: true });
    txt(c, r.name, x + u * 4.4, yy, w - u * 12, rh, { sizePx: u * 1.5, color: th.ink, oneLine: true, vcenter: true });
    txt(c, String(r.page), x + w - u * 6, yy, u * 6, rh, { sizePx: u * 1.5, color: th.muted, align: 'right', oneLine: true, vcenter: true });
    c.ctx.save(); c.ctx.globalAlpha = 0.4; line(c, x, yy + rh - u * 0.2, x + w, yy + rh - u * 0.2, th.soft, 1); c.ctx.restore();
  });
  footer(c, company, pageNo);
}

/** The back page: who to contact, and the one note about prices. */
export function drawBack(c, company, logo, asAt) {
  const th = themeOf('night'); const { u, W, H } = c;
  clearPage(c, th.bg); panel(c, { x: 0, y: 0, w: W, h: H }, th, 0);
  const x = MARGIN * 2 * u; const w = W - MARGIN * 4 * u; let y = H * 0.28;
  if (logo) { const r = Math.min((u * 22) / logo.width, (u * 10) / logo.height); c.ctx.drawImage(logo, x, y, logo.width * r, logo.height * r); y += logo.height * r + u * 4; }
  txt(c, company?.name ?? '', x, y, w, u * 8, { font: 'headline', sizePx: u * 3.6, color: th.ink }); y += u * 9;
  const rows = [[company?.address, company?.city].filter(Boolean).join(', '), company?.phone, company?.email, company?.website].filter(Boolean);
  rows.forEach((r, n) => txt(c, r, x, y + n * u * 3.2, w, u * 3, { sizePx: u * 1.7, color: th.ink, oneLine: true }));
  y += rows.length * u * 3.2 + u * 5;
  line(c, x, y, x + u * 12, y, th.accent, 4); y += u * 3;
  txt(c, `Each price is in its own currency. Prices are as at ${fmtDate(asAt ?? new Date())} or as of the price list named beside them, and may change.`, x, y, w * 0.8, u * 12, { sizePx: u * 1.3, color: th.muted });
}

