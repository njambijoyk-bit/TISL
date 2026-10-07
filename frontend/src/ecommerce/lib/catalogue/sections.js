import { fmtAmount, fmtDate, fmtDateTime } from '../priceList/format';
import { heading, line, panel, photo, txt } from './draw';

// The sections of a brochure page, by item type. Each one: `has(item)` (is there anything to show), `want(item)` and `min(item)` (the height it would like and the least it can do with),
// `grow` (a picture section that takes any space left over), and `draw(c, box, item, theme)`. Sections that find nothing to show are left out and the rest share the page.

const PAD = 2;   // in units of one percent of the page width

const list = (v) => (Array.isArray(v) ? v : []);
const labelOf = (x, item) => [x.variant, x.unit].filter(Boolean).join(' · ') || item.name;
const stampOf = (item) => (item.price_source?.kind === 'list' ? `As of ${item.price_source.name}, ${fmtDate(item.price_source.as_at)}` : `As of ${fmtDate(item.price_source?.as_at)}`);
const money = (n, x) => fmtAmount(n, x.currency_code, x.currency_symbol);
const inner = (c, b) => ({ x: b.x + PAD * c.u, y: b.y + PAD * c.u, w: b.w - 2 * PAD * c.u, h: b.h - 2 * PAD * c.u });

/** The picture at an index of the item's own pictures (loaded for the page), or null. */
const img = (c, item, i) => c.imgs[item.images?.[i]] ?? null;

function heroFull(c, b, item, th) {
  panel(c, b, th);
  const { u } = c; const i = inner(c, b);
  const ph = { x: i.x, y: i.y, w: i.w, h: i.h * 0.62 };
  photo(c, img(c, item, 0), ph, th, item.name);
  let y = ph.y + ph.h + u * 1.4;
  const tag = [item.tagline, item.category && item.category !== item.tagline ? item.category : null].filter(Boolean).join('  ·  ');
  txt(c, tag, i.x, y, i.w, u * 2, { font: 'wide', sizePx: u * 1.05, color: th.accent, oneLine: true }); y += u * 2.4;
  txt(c, item.name, i.x, y, i.w, u * 7.2, { font: th.head, sizePx: u * 4.4, color: th.ink }); y += u * 7.4;
  txt(c, item.short || (item.description ?? '').slice(0, 220), i.x, y, i.w, Math.max(0, b.y + b.h - PAD * u - y), { sizePx: u * 1.5, color: th.muted });
}

function gallery(c, b, item, th) {
  panel(c, b, th);
  const i = inner(c, b); const pics = item.images.slice(1, 5); const gap = c.u * 1;
  const w = (i.w - gap * (pics.length - 1)) / pics.length;
  pics.forEach((_, k) => photo(c, img(c, item, k + 1), { x: i.x + k * (w + gap), y: i.y, w, h: i.h }, th, item.name, 1));
}

function story(c, b, item, th, title = 'About') {
  panel(c, b, th);
  const i = inner(c, b);
  heading(c, title, i.x, i.y, i.w, th);
  txt(c, item.description || item.short, i.x, i.y + c.u * 2.8, i.w, i.h - c.u * 2.8, { sizePx: c.u * 1.5, color: th.ink });
}

function bullets(c, b, item, th, title = 'Features') {
  panel(c, b, th);
  const i = inner(c, b); const { u } = c;
  heading(c, title, i.x, i.y, i.w, th);
  const items = list(item.features); const half = Math.ceil(items.length / 2); const cw = (i.w - u * 2) / 2; const top = i.y + u * 3; const rowH = Math.min(u * 3, (i.h - u * 3) / Math.max(1, half));
  [items.slice(0, half), items.slice(half)].forEach((col, k) => col.forEach((f, r) => {
    const x = i.x + k * (cw + u * 2); const y = top + r * rowH;
    txt(c, '•', x, y, u * 1.4, rowH, { color: th.accent, sizePx: u * 1.6, weight: 700, oneLine: true });
    txt(c, f, x + u * 1.6, y, cw - u * 1.6, rowH, { sizePx: u * 1.4, color: th.ink });
  }));
}

function specs(c, b, item, th) {
  panel(c, b, th);
  const i = inner(c, b); const { u } = c;
  heading(c, 'Specifications', i.x, i.y, i.w, th);
  const rows = list(item.specs); const cols = rows.length > 6 ? 2 : 1; const per = Math.ceil(rows.length / cols); const cw = (i.w - (cols - 1) * u * 2) / cols;
  const top = i.y + u * 3; const rowH = Math.min(u * 2.8, (i.h - u * 3) / per);
  rows.forEach((r, n) => {
    const col = Math.floor(n / per); const row = n % per; const x = i.x + col * (cw + u * 2); const y = top + row * rowH;
    if (row % 2 === 0) { c.ctx.save(); c.ctx.fillStyle = th.soft; c.ctx.globalAlpha = 0.55; c.ctx.fillRect(x - u * 0.4, y, cw + u * 0.8, rowH); c.ctx.restore(); }
    txt(c, r.label, x, y, cw * 0.42, rowH, { sizePx: u * 1.25, color: th.muted, oneLine: true, vcenter: true });
    txt(c, r.value, x + cw * 0.45, y, cw * 0.55, rowH, { sizePx: u * 1.3, color: th.ink, weight: 700, oneLine: true, vcenter: true });
  });
}

/** Every price of the item: its price excluding tax (with the earlier price), the tax, the total. */
function priceTable(c, b, item, th, title) {
  panel(c, b, th);
  const i = inner(c, b); const { u, ctx } = c;
  heading(c, title, i.x, i.y, i.w, th);
  const rows = list(item.lines);
  const cols = { label: i.x, price: i.x + i.w * 0.66, tax: i.x + i.w * 0.84, total: i.x + i.w };
  let y = i.y + u * 2.8;
  const hd = (s, x, align) => txt(c, s, align === 'right' ? x - i.w * 0.17 : x, y, i.w * 0.17, u * 1.6, { sizePx: u * 0.95, color: th.muted, align, oneLine: true, font: 'sans', weight: 700 });
  hd('PRICE (EXCL. TAX)', cols.price, 'right'); hd('TAX', cols.tax, 'right'); hd('TOTAL', cols.total, 'right');
  y += u * 1.9; line(c, i.x, y, i.x + i.w, y, th.soft, 2); y += u * 0.5;
  const foot = u * 3.4; const rh = u * 4.4;
  const room = Math.max(1, Math.floor((i.y + i.h - foot - y) / rh));
  const shown = rows.length > room ? rows.slice(0, Math.max(1, room - 1)) : rows;
  shown.forEach((x) => {
    txt(c, labelOf(x, item), cols.label, y, i.w * 0.5, u * 2, { sizePx: u * 1.4, color: th.ink, oneLine: true });
    if (x.branches?.length) txt(c, `Offered at ${x.branches.join(', ')}`, cols.label, y + u * 1.9, i.w * 0.5, u * 1.4, { sizePx: u * 0.95, color: th.muted, oneLine: true });
    txt(c, money(x.price, x), cols.price - i.w * 0.17, y, i.w * 0.17, u * 2, { sizePx: u * 1.5, color: th.ink, weight: 700, align: 'right', oneLine: true });
    if (x.strike || x.was) {
      const s = x.strike ? money(x.strike, x) : `Was ${money(x.was, x)}, up ${x.up_percent}%`;
      txt(c, s, cols.price - i.w * 0.2, y + u * 1.9, i.w * 0.2, u * 1.4, { sizePx: u * 0.95, color: th.muted, align: 'right', oneLine: true });
      if (x.strike) { const w = Math.min(i.w * 0.2, (s.length * u * 0.5)); line(c, cols.price - w, y + u * 2.6, cols.price, y + u * 2.6, th.muted, 1); }
    }
    txt(c, money(x.tax_amount, x), cols.tax - i.w * 0.17, y, i.w * 0.17, u * 2, { sizePx: u * 1.35, color: th.ink, align: 'right', oneLine: true });
    if (x.tax_name) txt(c, x.tax_name, cols.tax - i.w * 0.17, y + u * 1.9, i.w * 0.17, u * 1.4, { sizePx: u * 0.95, color: th.muted, align: 'right', oneLine: true });
    txt(c, money(x.total, x), cols.total - i.w * 0.17, y, i.w * 0.17, u * 2, { sizePx: u * 1.5, color: th.ink, weight: 700, align: 'right', oneLine: true });
    y += rh;
    ctx.save(); ctx.globalAlpha = 0.5; line(c, i.x, y - u * 0.3, i.x + i.w, y - u * 0.3, th.soft, 1); ctx.restore();
  });
  if (rows.length > shown.length) txt(c, `…and ${rows.length - shown.length} more`, cols.label, y, i.w * 0.5, rh, { sizePx: u * 1.25, color: th.muted, oneLine: true });
  const fy = i.y + i.h - u * 2.6;
  txt(c, stampOf(item), i.x, fy, i.w * 0.5, u * 1.4, { sizePx: u * 1.05, color: th.accent, weight: 700, oneLine: true });
}

function details(c, b, item, th) {
  panel(c, b, th);
  const i = inner(c, b); const { u } = c;
  const facts = [['Code', item.sku], ['Barcode', item.barcode], ['Category', item.category], ['Brand', item.brand], ['Unit', item.lines?.[0]?.unit]].filter(([, v]) => v);
  const cw = (i.w - u * (facts.length - 1)) / Math.max(1, facts.length);
  facts.forEach(([k, v], n) => {
    const x = i.x + n * (cw + u);
    txt(c, k.toUpperCase(), x, i.y, cw, u * 1.4, { sizePx: u * 0.95, color: th.muted, oneLine: true, weight: 700 });
    txt(c, v, x, i.y + u * 1.7, cw, i.h - u * 1.7, { sizePx: u * 1.4, color: th.ink, weight: 700, oneLine: true });
  });
}

function inside(c, b, item, th) {
  panel(c, b, th);
  const i = inner(c, b); const { u, ctx } = c;
  heading(c, "What's inside", i.x, i.y, i.w, th);
  const rows = list(item.inside); const cols = rows.length > 5 ? 2 : 1; const per = Math.ceil(rows.length / cols); const cw = (i.w - (cols - 1) * u * 2) / cols;
  const top = i.y + u * 3; const rowH = Math.min(u * 4.2, (i.h - u * 3) / per);
  rows.forEach((r, n) => {
    const col = Math.floor(n / per); const row = n % per; const x = i.x + col * (cw + u * 2); const y = top + row * rowH;
    const pic = c.imgs[r.image];
    const d = rowH * 0.86;
    ctx.save(); ctx.beginPath(); ctx.arc(x + d / 2, y + rowH / 2, d / 2, 0, Math.PI * 2); ctx.clip();
    if (pic) { const s = Math.max(d / pic.width, d / pic.height); ctx.drawImage(pic, x + d / 2 - (pic.width * s) / 2, y + rowH / 2 - (pic.height * s) / 2, pic.width * s, pic.height * s); } else { ctx.fillStyle = th.soft; ctx.fillRect(x, y, d, rowH); }
    ctx.restore();
    txt(c, `${r.quantity} ×`, x + d + u * 0.8, y, u * 3.4, rowH, { sizePx: u * 1.5, color: th.accent, weight: 700, vcenter: true, oneLine: true });
    txt(c, r.name, x + d + u * 4.4, y, cw - d - u * 4.4, rowH, { sizePx: u * 1.45, color: th.ink, vcenter: true, oneLine: true });
  });
}

/** A hamper's or auction's one big price, with its tax. */
function bigPrice(c, b, item, th, title) {
  panel(c, b, th);
  const i = inner(c, b); const { u } = c;
  const x = list(item.lines)[0];
  heading(c, title, i.x, i.y, i.w, th);
  if (!x) return;
  txt(c, money(x.price, x), i.x, i.y + u * 2.8, i.w * 0.6, i.h * 0.5, { font: th.head, sizePx: u * 5, color: th.ink, oneLine: true });
  txt(c, 'excluding tax', i.x, i.y + u * 2.8 + i.h * 0.46, i.w * 0.6, u * 1.6, { sizePx: u * 1.1, color: th.muted, oneLine: true });
  const tax = x.tax_name ? `${x.tax_name}: ${money(x.tax_amount, x)}   ·   Total ${money(x.total, x)}` : `Total ${money(x.total, x)}`;
  txt(c, tax, i.x, i.y + i.h - u * 5.4, i.w, u * 2, { sizePx: u * 1.5, color: th.ink, weight: 700, oneLine: true });
  txt(c, `${stampOf(item)}`, i.x, i.y + i.h - u * 2.6, i.w, u * 1.5, { sizePx: u * 1.05, color: th.accent, oneLine: true });
  if (item.type === 'hamper' && item.stock_left != null) txt(c, `${item.stock_left} left`, i.x + i.w * 0.6, i.y + u * 3, i.w * 0.4, u * 2.4, { sizePx: u * 1.8, color: th.accent, weight: 700, align: 'right', oneLine: true });
}

/** An auction's current price, and what the winner pays: the bid, its tax, each charge and the total, as the auction page shows it. */
function auctionPrice(c, b, item, th) {
  panel(c, b, th);
  const i = inner(c, b); const { u } = c; const p = item.payable; const x = list(item.lines)[0];
  heading(c, 'Current price and what you pay', i.x, i.y, i.w, th);
  if (x) {
    txt(c, money(x.price, x), i.x, i.y + u * 2.8, i.w * 0.44, u * 7, { font: th.head, sizePx: u * 4.6, color: th.ink, oneLine: true });
    txt(c, 'current bid', i.x, i.y + u * 10, i.w * 0.44, u * 1.6, { sizePx: u * 1.1, color: th.muted, oneLine: true });
    txt(c, stampOf(item), i.x, i.y + i.h - u * 1.6, i.w * 0.44, u * 1.4, { sizePx: u * 0.95, color: th.accent, oneLine: true });
  }
  if (!p) return;
  const cur = (n) => fmtAmount(n, p.currency_code, p.currency_symbol);
  const x0 = i.x + i.w * 0.5; const w = i.w * 0.5; const rh = u * 3.1;
  txt(c, `IF YOU WIN AT ${cur(p.bid).toUpperCase()}`, x0, i.y + u * 2.8, w, u * 1.4, { sizePx: u * 0.95, color: th.muted, weight: 700, oneLine: true });
  p.rows.forEach((r, n) => {
    const y = i.y + u * 5 + n * rh;
    txt(c, r.label, x0, y, w * 0.62, rh, { sizePx: u * 1.35, color: th.ink, oneLine: true, vcenter: true });
    txt(c, cur(r.amount), x0 + w * 0.6, y, w * 0.4, rh, { sizePx: u * 1.35, color: th.ink, align: 'right', oneLine: true, vcenter: true });
  });
  const ty = i.y + u * 5 + p.rows.length * rh + u * 0.4;
  line(c, x0, ty, x0 + w, ty, th.accent, 2);
  txt(c, 'Amount payable', x0, ty + u * 0.6, w * 0.6, rh, { sizePx: u * 1.6, color: th.ink, weight: 700, oneLine: true, vcenter: true });
  txt(c, cur(p.payable), x0 + w * 0.5, ty + u * 0.6, w * 0.5, rh, { sizePx: u * 1.8, color: th.accent, weight: 700, align: 'right', oneLine: true, vcenter: true });
}

/** A service's extra charges: a deposit, surcharges, a service charge, with when each applies. */
function chargesSection(c, b, item, th) {
  panel(c, b, th);
  const i = inner(c, b); const { u } = c;
  heading(c, 'Extra charges', i.x, i.y, i.w, th);
  const rows = list(item.charges); const rh = Math.min(u * 3.4, (i.h - u * 3) / Math.max(1, rows.length));
  const cur = list(item.lines)[0];
  rows.forEach((r, n) => {
    const y = i.y + u * 3 + n * rh;
    const when = [r.when, r.unit ? `per ${r.unit}` : null, r.refundable ? 'refundable' : null].filter(Boolean).join(', ');
    txt(c, r.name, i.x, y, i.w * 0.5, rh, { sizePx: u * 1.4, color: th.ink, oneLine: true, vcenter: true });
    txt(c, when, i.x + i.w * 0.5, y, i.w * 0.28, rh, { sizePx: u * 1.05, color: th.muted, oneLine: true, vcenter: true });
    txt(c, r.basis === 'percent' ? `${r.amount}%` : money(r.amount, cur ?? {}), i.x + i.w * 0.78, y, i.w * 0.22, rh, { sizePx: u * 1.4, color: th.ink, weight: 700, align: 'right', oneLine: true, vcenter: true });
  });
}

function lot(c, b, item, th) {
  panel(c, b, th);
  const i = inner(c, b); const { u } = c; const a = item.auction ?? {};
  heading(c, 'The lot', i.x, i.y, i.w, th);
  txt(c, item.description || item.short, i.x, i.y + u * 2.8, i.w * 0.58, i.h - u * 2.8, { sizePx: u * 1.45, color: th.ink });
  const facts = [['Starts at', a.start_price], ['Each bid goes up by', a.bid_increment], ['Now at', a.current_price]];
  facts.forEach(([k, v], n) => {
    const y = i.y + u * 3 + n * ((i.h - u * 3) / 3);
    txt(c, k.toUpperCase(), i.x + i.w * 0.64, y, i.w * 0.36, u * 1.3, { sizePx: u * 0.95, color: th.muted, weight: 700, oneLine: true });
    txt(c, fmtAmount(v, a.currency_code, a.currency_symbol), i.x + i.w * 0.64, y + u * 1.4, i.w * 0.36, u * 2.6, { sizePx: u * 2.2, color: th.ink, weight: 700, oneLine: true });
  });
}

function schedule(c, b, item, th) {
  panel(c, b, th);
  const i = inner(c, b); const { u } = c; const a = item.auction ?? {};
  heading(c, 'Schedule', i.x, i.y, i.w, th);
  [['Opens', a.starts], ['Closes', a.ends]].forEach(([k, v], n) => {
    const x = i.x + n * i.w * 0.5;
    txt(c, k.toUpperCase(), x, i.y + u * 3, i.w * 0.48, u * 1.3, { sizePx: u * 0.95, color: th.muted, weight: 700, oneLine: true });
    txt(c, fmtDateTime(v), x, i.y + u * 4.6, i.w * 0.48, i.h - u * 4.6, { font: th.head, sizePx: u * 2.2, color: th.ink, oneLine: true });
  });
}

function terms(c, b, item, th) {
  panel(c, b, th);
  const i = inner(c, b); const { u } = c;
  heading(c, 'Good to know', i.x, i.y, i.w, th);
  const rows = [];
  if (item.type === 'hamper') {
    if (item.valid_from || item.valid_until) rows.push(`Available ${item.valid_from ? `from ${fmtDate(item.valid_from)}` : ''}${item.valid_until ? ` until ${fmtDate(item.valid_until)}` : ''}.`);
    rows.push('Made while stock lasts. Contents may be replaced with items of the same value.');
  } else if (item.type === 'auction') {
    rows.push(`Bids are placed in ${item.auction?.currency_code ?? 'the lot’s currency'}. The highest bid when the auction closes wins, if it meets any reserve.`);
  }
  txt(c, rows.join('\n'), i.x, i.y + u * 2.8, i.w, i.h - u * 2.8, { sizePx: u * 1.35, color: th.ink });
}

const present = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(String(v ?? '').trim()));
const rowsOf = (it, key) => list(it[key]).length;

// want / min are heights in units of one percent of the page width; `grow` sections (pictures) take any space left over.
const HERO = { has: () => true, want: () => 62, min: () => 40, grow: true, draw: heroFull };
const GALLERY = { has: (it) => list(it.images).length > 1, want: () => 22, min: () => 14, grow: true, draw: gallery };
const STORY = { has: (it) => present(it.description) || present(it.short), want: (it) => 12 + Math.min(14, (it.description?.length ?? 0) / 75), min: () => 9, draw: story };
const FEATURES = { has: (it) => present(it.features), want: (it) => 8 + Math.ceil(rowsOf(it, 'features') / 2) * 3, min: () => 8, draw: bullets };
const SPECS = { has: (it) => present(it.specs), want: (it) => 8 + Math.ceil(rowsOf(it, 'specs') / (rowsOf(it, 'specs') > 6 ? 2 : 1)) * 3, min: () => 10, draw: specs };
const DETAILS = { has: (it) => present(it.sku) || present(it.barcode) || present(it.category) || present(it.brand), want: () => 9, min: () => 8, draw: details };
const LINES = (title) => ({ has: (it) => rowsOf(it, 'lines') > 0, want: (it) => 13 + rowsOf(it, 'lines') * 4.4, min: (it) => 13 + Math.min(4, rowsOf(it, 'lines')) * 4.4, draw: (c, b, it, th) => priceTable(c, b, it, th, title) });
const INSIDE = { has: (it) => present(it.inside), want: (it) => 8 + Math.ceil(rowsOf(it, 'inside') / (rowsOf(it, 'inside') > 5 ? 2 : 1)) * 4.2, min: () => 14, draw: inside };
const BIG = (title) => ({ has: (it) => rowsOf(it, 'lines') > 0, want: () => 24, min: () => 20, draw: (c, b, it, th) => bigPrice(c, b, it, th, title) });
const TERMS = { has: () => true, want: () => 14, min: () => 10, draw: terms };

export const SECTIONS = {
  product: { hero: HERO, gallery: GALLERY, story: STORY, features: FEATURES, specs: SPECS, prices: LINES('Prices'), details: DETAILS },
  service: { hero: HERO, gallery: GALLERY, story: STORY, features: FEATURES, packages: LINES('Packages and prices'), charges: { has: (it) => rowsOf(it, 'charges') > 0, want: (it) => 8 + rowsOf(it, 'charges') * 3.4, min: (it) => 8 + rowsOf(it, 'charges') * 3, draw: chargesSection }, details: DETAILS },
  hamper: { hero: HERO, inside: INSIDE, story: STORY, price: BIG('Price'), terms: TERMS },
  auction: { hero: HERO, lot: { has: (it) => Boolean(it.auction), want: () => 28, min: () => 22, draw: lot }, schedule: { has: (it) => Boolean(it.auction), want: () => 15, min: () => 12, draw: schedule }, price: { has: (it) => rowsOf(it, 'lines') > 0, want: (it) => 16 + (it.payable?.rows?.length ?? 0) * 3.1 + 6, min: (it) => 14 + (it.payable?.rows?.length ?? 0) * 3.1 + 6, draw: auctionPrice }, terms: TERMS },
};

/** The pictures an item needs on its page (the loader fetches only these). */
export const picturesOf = (item, size = 'full') => [...list(item.images).slice(0, size === 'full' ? 5 : 1), ...(size === 'full' ? list(item.inside).slice(0, 12).map((r) => r.image) : [])].filter(Boolean);

// ---- the smaller sizes: half page and card ------------------------------------------------------------------------------------------------------

/** The theme of an entry in a small size: its hero section's, or its first section's. */
const leadTheme = (sections) => (sections.find((s) => s.key === 'hero') ?? sections[0])?.theme;

/** A half-page or card entry: the picture, the name, a line or two of text, and the first prices. */
export function drawCompact(c, b, item, size, th) {
  panel(c, b, th);
  const { u } = c; const p = (size === 'card' ? 1.3 : PAD) * u;
  const stamp = stampOf(item); const rows = list(item.lines);
  if (size === 'half') {
    const ph = { x: b.x + p, y: b.y + p, w: Math.min(b.w * 0.36, b.h - 2 * p), h: b.h - 2 * p };
    photo(c, img(c, item, 0), ph, th, item.name);
    const x = ph.x + ph.w + p * 1.2; const w = b.x + b.w - p - x;
    let y = b.y + p;
    txt(c, [item.tagline, item.category && item.category !== item.tagline ? item.category : null].filter(Boolean).join('  ·  '), x, y, w, u * 1.8, { font: 'wide', sizePx: u * 1, color: th.accent, oneLine: true }); y += u * 2.2;
    txt(c, item.name, x, y, w, u * 4.6, { font: th.head, sizePx: u * 3.1, color: th.ink }); y += u * 4.8;
    txt(c, item.short || (item.description ?? '').slice(0, 160), x, y, w, u * 5.2, { sizePx: u * 1.3, color: th.muted }); y += u * 5.6;
    const rh = u * 2.5; const room = Math.max(1, Math.floor((b.y + b.h - p - u * 2 - y) / rh));
    rows.slice(0, room).forEach((r, n) => {
      txt(c, labelOf(r, item), x, y + n * rh, w * 0.5, rh, { sizePx: u * 1.25, color: th.ink, oneLine: true });
      txt(c, `${money(r.price, r)}${r.tax_name ? `  + ${r.tax_name}` : ''}`, x + w * 0.5, y + n * rh, w * 0.5, rh, { sizePx: u * 1.3, color: th.ink, weight: 700, align: 'right', oneLine: true });
    });
    if (rows.length > room) txt(c, `…and ${rows.length - room} more`, x, y + room * rh - u * 0.2, w, u * 1.5, { sizePx: u * 1, color: th.muted, oneLine: true });
    txt(c, stamp, x, b.y + b.h - p - u * 1.4, w, u * 1.4, { sizePx: u * 0.95, color: th.accent, weight: 700, oneLine: true });
  } else {
    const ph = { x: b.x + p, y: b.y + p, w: b.w - 2 * p, h: b.h * 0.46 };
    photo(c, img(c, item, 0), ph, th, item.name, 0.8);
    let y = ph.y + ph.h + u * 0.9;
    txt(c, item.name, b.x + p, y, b.w - 2 * p, u * 4.2, { font: th.head, sizePx: u * 2.1, color: th.ink }); y += u * 4.4;
    const first = rows[0];
    if (first) txt(c, `${rows.length > 1 ? 'From ' : ''}${money(Math.min(...rows.map((r) => r.price)), first)}`, b.x + p, y, b.w - 2 * p, u * 2, { sizePx: u * 1.6, color: th.ink, weight: 700, oneLine: true });
    if (first?.tax_name) txt(c, `+ ${first.tax_name}`, b.x + p, y + u * 2, b.w - 2 * p, u * 1.4, { sizePx: u * 0.95, color: th.muted, oneLine: true });
    txt(c, stamp, b.x + p, b.y + b.h - p - u * 1.2, b.w - 2 * p, u * 1.2, { sizePx: u * 0.8, color: th.accent, oneLine: true });
  }
}

export { leadTheme };
