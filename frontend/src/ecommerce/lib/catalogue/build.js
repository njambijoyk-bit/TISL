import { FONT_STYLES, loadMoodboardFonts } from '../../../campaigns/lib/moodboardKit';
import { loadImage } from '../../../campaigns/lib/moodboardExport';
import { storageUrl } from '../../../_shared/lib/storageUrl';
import { saveBlob } from '../brochure/pdf';
import { slugify } from '../priceList/format';
import { JpegPdf } from './pdfJpeg';
import { drawBack, drawContents, drawCover, drawFullEntry, drawSmallPage, newPage } from './pages';
import { picturesOf } from './sections';

const PER = { half: 2, card: 6 };
const CONTENTS_PER_PAGE = 34;
const tick = () => new Promise((r) => setTimeout(r, 0));
const src = (u) => (String(u).startsWith('data:') ? u : storageUrl(u));

/** Pull every slice of a brochure's entries (the data is small; the pictures are loaded page by page later). */
export async function gather(loadSlice, onProgress) {
  const first = await loadSlice(0);
  const entries = [...first.entries];
  let next = first.next;
  while (next !== null && next !== undefined) {
    const r = await loadSlice(next);
    entries.push(...r.entries); next = r.next;
    onProgress?.({ stage: 'Collecting the items', done: entries.length, total: first.brochure.total });
  }

  return { brochure: first.brochure, entries };
}

/** The pages in order: how the entries pack (one full page, two halves, six cards), then the cover, contents and back page around them. */
export function plan(brochure, entries) {
  const body = [];
  let open = null;
  entries.forEach((e) => {
    const size = e.size ?? brochure.size ?? 'full';
    if (size === 'full') { open = null; body.push({ kind: 'full', items: [e] }); return; }
    if (!open || open.size !== size || open.items.length >= PER[size]) { open = { kind: 'small', size, items: [] }; body.push(open); }
    open.items.push(e);
  });
  const catalogue = entries.length > 1;
  const cov = Boolean(brochure.settings?.cover) && catalogue;
  const toc = Boolean(brochure.settings?.contents) && catalogue;
  const tocPages = toc ? Math.ceil(entries.length / CONTENTS_PER_PAGE) : 0;
  const offset = (cov ? 1 : 0) + tocPages;
  body.forEach((p, i) => p.items.forEach((e) => { e.pageNo = offset + i + 1; }));

  return { cov, toc, tocPages, body, back: brochure.settings?.back !== false, total: offset + body.length + (brochure.settings?.back !== false ? 1 : 0) };
}

/**
 * Draw a brochure or catalogue page by page, handing each finished canvas to `onPage(canvas, index, total)`. The one canvas is reused, so memory stays flat.
 * @param {{loadSlice:(from:number)=>Promise<object>, company:object, width?:number, onProgress?:Function, onPage:Function, maxPages?:number}} o
 */
export async function renderCatalogue({ loadSlice, company, width = 1240, onProgress, onPage, maxPages = Infinity }) {
  loadMoodboardFonts();
  try { await Promise.all(Object.keys(FONT_STYLES).map((k) => document.fonts.load(`${FONT_STYLES[k].weight} 40px ${FONT_STYLES[k].family}`))); } catch { /* system fonts will do */ }
  const { brochure, entries } = await gather(loadSlice, onProgress);
  if (!entries.length) throw new Error('There is nothing in this brochure that you can see.');
  const pl = plan(brochure, entries);
  const logo = company?.logo_view ? await loadImage(storageUrl(company.logo_view)) : null;
  const c = newPage(width);
  let index = 0;
  const total = Math.min(pl.total, maxPages);
  const emit = async () => { await onPage(c.cv, index, total); index += 1; onProgress?.({ stage: 'Drawing the pages', done: index, total }); await tick(); };
  const load = async (items, size) => {
    const urls = [...new Set(items.flatMap((it) => picturesOf(it, size)))];
    const out = {};
    await Promise.all(urls.map(async (u) => { out[u] = await loadImage(src(u)); }));
    c.imgs = out;
  };

  if (pl.cov) {
    const pics = [];
    for (const e of entries.slice(0, 4)) { const u = e.images?.[0]; if (u) pics.push(await loadImage(src(u))); }
    drawCover(c, brochure, company, pics.filter(Boolean), logo); await emit();
  }
  for (let t = 0; t < pl.tocPages && index < total; t++) {
    const rows = entries.slice(t * CONTENTS_PER_PAGE, (t + 1) * CONTENTS_PER_PAGE).map((e) => ({ name: e.name, page: e.pageNo }));
    drawContents(c, rows, t * CONTENTS_PER_PAGE + 1, company, index + 1, t === 0); await emit();
  }
  for (const pg of pl.body) {
    if (index >= total) break;
    if (pg.kind === 'full') { await load(pg.items, 'full'); drawFullEntry(c, pg.items[0], company, index + 1); } else { await load(pg.items, pg.size); drawSmallPage(c, pg.items, pg.size, company, index + 1); }
    await emit();
  }
  if (pl.back && index < total) { drawBack(c, company, logo); await emit(); }

  return { brochure, pages: index, totalPages: pl.total };
}

const jpegBytes = async (cv, quality) => new Uint8Array(await (await new Promise((r) => cv.toBlob(r, 'image/jpeg', quality))).arrayBuffer());

/** The whole thing as a PDF. A very long catalogue is drawn a little smaller to keep the file and the memory in check. */
export async function catalogueToPdf({ loadSlice, company, onProgress }) {
  const pdf = new JpegPdf('Brochure');
  let title = 'brochure';
  const probe = await loadSlice(0);
  const approx = (probe.brochure.total ?? 1) * 1;
  const width = approx > 150 ? 900 : approx > 60 ? 1050 : 1240;
  const r = await renderCatalogue({ loadSlice: (from) => (from === 0 ? Promise.resolve(probe) : loadSlice(from)), company, width, onProgress,
    onPage: async (cv) => { pdf.add(await jpegBytes(cv, width > 1000 ? 0.84 : 0.8), cv.width, cv.height); } });
  title = r.brochure.title;
  pdf.title = title;

  return { blob: pdf.blob(), name: `${slugify(title)}.pdf`, pages: r.pages };
}

/** Save a catalogue as a PDF named after it. */
export async function downloadCataloguePdf(opts) {
  const { blob, name } = await catalogueToPdf(opts);
  saveBlob(blob, name);
}

/** The first pages as small pictures, for a preview on screen. */
export async function cataloguePreview({ loadSlice, company, maxPages = 6, width = 640, onProgress }) {
  const shots = [];
  const r = await renderCatalogue({ loadSlice, company, width, maxPages, onProgress, onPage: async (cv) => { shots.push(cv.toDataURL('image/jpeg', 0.82)); } });

  return { pages: shots, totalPages: r.totalPages, brochure: r.brochure };
}
