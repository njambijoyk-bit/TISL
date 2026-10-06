import { renderBrochure } from './render';
import { pdfFromCanvases, saveBlob } from './pdf';

/** The page pictures (canvases) for a brochure, on the template its settings choose. */
export const brochurePages = (data, deps, opts) => renderBrochure(data, data.settings?.template ?? 'classic', deps, opts);

/** Draw a brochure and save it as a PDF named after the service. */
export async function downloadBrochurePdf(data, deps) {
  const pages = await brochurePages(data, deps, { width: 1240 });
  const name = String(data.service?.name ?? 'service').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'service';
  saveBlob(pdfFromCanvases(pages), `${name}-brochure.pdf`);
}
