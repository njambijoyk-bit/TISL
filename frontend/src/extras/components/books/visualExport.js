import { startJob } from './visualProgress';

const COLOR_PROPS = ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor', 'textDecorationColor', 'fill', 'stroke'];

/** A colour as plain rgba(): html2canvas cannot read color-mix(), oklch() or color(), which the theme and the tint helper use. */
function rgbOf(ctx, value) {
  if (!value || value === 'none' || value === 'transparent') return 'rgba(0, 0, 0, 0)';
  try {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
  } catch { return value; }
}

/** Save a chart card as a PNG: whatever is on the card, legend and title included, without its own buttons (they carry data-html2canvas-ignore). */
let tail = Promise.resolve();
let waiting = 0;

/** Pictures are made one at a time (drawing two at once makes each fail or stall), so one asked for while another is being made waits its turn and shows as waiting. */
export function saveCardImage(el, name) {
  const job = startJob(name, waiting > 0);
  waiting += 1;
  const run = tail.catch(() => {}).then(() => makeImage(el, name, job)).finally(() => { waiting -= 1; });
  tail = run;
  return run;
}

async function makeImage(el, name, job) {
  try {
    job.step(8, 'Getting ready');
    const { default: html2canvas } = await import('html2canvas');
    const pix = document.createElement('canvas'); pix.width = 1; pix.height = 1;
    const ctx = pix.getContext('2d', { willReadFrequently: true });
    // the card's own background, resolved: the theme's --surface-card is a color-mix()
    const probe = document.createElement('div');
    probe.style.background = 'var(--surface-card, #fff)';
    document.body.appendChild(probe);
    const bg = rgbOf(ctx, getComputedStyle(probe).backgroundColor);
    probe.remove();
    job.step(20, 'Copying the chart');
    const canvas = await html2canvas(el, {
      backgroundColor: bg, scale: 2, useCORS: true, logging: false,
      onclone: (doc, root) => {
        const view = doc.defaultView;
        const all = [root, ...root.querySelectorAll('*')];
        all.forEach((n, i) => {
          const cs = view.getComputedStyle(n);
          COLOR_PROPS.forEach((p) => { if (cs[p] && cs[p] !== 'none') n.style[p] = rgbOf(ctx, cs[p]); });   // `none` (an SVG with no fill or stroke) must stay none
          if (cs.boxShadow && cs.boxShadow !== 'none') n.style.boxShadow = 'none';
          if (cs.backgroundImage && cs.backgroundImage.includes('color')) n.style.backgroundImage = 'none';
          if (i % 40 === 0) job.step(20 + Math.round((i / all.length) * 30), 'Matching colours');
        });
        job.step(55, 'Drawing the picture');
      },
    });
    job.step(85, 'Making the file');
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The image could not be made.');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    job.done();
  } catch (e) {
    job.fail('Could not make the image');
    throw e;
  }
}

/** The table of a chart as text for the clipboard (tab separated, so it pastes into a spreadsheet). */
export const tableText = (columns, rows) => [columns.map((c) => c.label).join('\t'), ...rows.map((r) => columns.map((c) => r[c.key] ?? '').join('\t'))].join('\n');
