import html2canvas from 'html2canvas';

/** Save a chart card as a PNG: whatever is on the card, legend and title included, without its own buttons (they carry data-html2canvas-ignore). */
export async function saveCardImage(el, name) {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--surface-card').trim() || '#ffffff';
  const canvas = await html2canvas(el, { backgroundColor: bg, scale: 2, useCORS: true, logging: false });
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
}

/** The table of a chart as text for the clipboard (tab separated, so it pastes into a spreadsheet). */
export const tableText = (columns, rows) => [columns.map((c) => c.label).join('\t'), ...rows.map((r) => columns.map((c) => r[c.key] ?? '').join('\t'))].join('\n');
