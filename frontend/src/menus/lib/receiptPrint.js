/** Print a receipt: the plain monospaced text in a window that prints itself, sized for a thermal roll (58 mm = 32 characters, 80 mm = 42). */
export function printReceipt(text, width = 32) {
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return false;
  const mm = width <= 32 ? 58 : 80;
  const esc = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  w.document.write(`<!doctype html><title>Receipt</title><style>@page{size:${mm}mm auto;margin:2mm}body{margin:0}pre{font:12px/1.25 monospace;margin:0;white-space:pre}</style><pre>${esc}</pre>`);
  w.document.close(); w.focus(); w.print();

  return true;
}
