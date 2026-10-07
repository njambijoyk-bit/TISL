import { cover, drawPattern } from '../../../campaigns/lib/moodboardExport';
import { drawText } from '../brochure/render';

// Drawing helpers shared by the brochure sections. `c` is the drawing context of one page: { ctx, W, H, u (one percent of the width), imgs }.

export const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); };

/** A themed panel: its colour, its pattern, rounded corners. */
export function panel(c, b, th, radius = 1.4) {
  const { ctx, u } = c;
  ctx.save(); rr(ctx, b.x, b.y, b.w, b.h, radius * u); ctx.clip();
  ctx.fillStyle = th.bg; ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.translate(b.x, b.y); drawPattern(ctx, th.pattern, th.bg, b.w, b.h);
  ctx.restore();
}

/** Text in a box, shrunk until it fits. Body text is the plain font at normal weight unless said otherwise. */
export function txt(c, str, x, y, w, h, o = {}) {
  if (str === null || str === undefined || String(str).trim() === '' || w <= 0 || h <= 0) return;
  const { ctx } = c;
  ctx.save(); ctx.translate(x, y);
  drawText(ctx, str, { w, h }, { font: 'sans', weight: 400, sizePx: c.u * 1.5, color: '#222', ...o });
  ctx.restore();
}

/** A picture covering a rounded box, or a soft block with the item's first letter when there is no picture. */
export function photo(c, img, b, th, name = '', radius = 1.2) {
  const { ctx, u } = c;
  ctx.save(); rr(ctx, b.x, b.y, b.w, b.h, radius * u); ctx.clip();
  if (img) cover(ctx, img, b.x, b.y, b.w, b.h);
  else {
    ctx.fillStyle = th.soft; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = th.accent; ctx.globalAlpha = 0.5; ctx.font = `700 ${Math.min(b.w, b.h) * 0.42}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(name).trim().charAt(0).toUpperCase() || '·', b.x + b.w / 2, b.y + b.h / 2);
  }
  ctx.restore();
}

export const line = (c, x1, y1, x2, y2, color, width = 1) => { const { ctx } = c; ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore(); };

/** A small coloured heading over a section. */
export function heading(c, str, x, y, w, th) {
  txt(c, str, x, y, w, c.u * 2.2, { font: 'wide', sizePx: c.u * 1.05, color: th.accent, oneLine: true });
}
