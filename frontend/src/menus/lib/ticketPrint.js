const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** A small paper ticket for a printer in the kitchen (a window that prints itself): the fallback when a screen is not there or has gone dark. */
export function printTicket(t, stationName) {
  const w = window.open('', '_blank', 'width=360,height=600');
  if (!w) return false;
  const lines = t.lines.map((l) => `<div class="l"><b>${l.quantity} × ${esc(l.name)}</b>${l.serving || (l.sides ?? []).length ? `<div style="padding-left:14px">${l.serving ? `<b>${esc(l.serving)}</b>` : ''}${(l.sides ?? []).map((s) => `<div>- ${esc(s)}</div>`).join('')}</div>` : ''}${l.options.length ? `<div>${esc(l.options.join(', '))}</div>` : ''}${l.note ? `<div>“${esc(l.note)}”</div>` : ''}${l.allergens.length ? `<div class="a">ALLERGENS: ${esc(l.allergens.join(', '))}</div>` : ''}</div>`).join('');
  w.document.write(`<!doctype html><title>${esc(t.number)}</title><style>body{font:14px monospace;width:300px;margin:8px}h1{font-size:20px;margin:0}.l{margin:8px 0;border-top:1px dashed #000;padding-top:6px}.a{font-weight:bold}</style>
<h1>${esc(t.number)}</h1><div>${esc(stationName)} · ${t.order_type === 'delivery' ? 'DELIVERY' : 'PICKUP'}</div><div>${esc(t.name)} · ${t.asap ? 'ASAP' : new Date(t.due_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
${t.notes ? `<div class="a">NOTE: ${esc(t.notes)}</div>` : ''}${(t.packaging ?? []).length ? `<div class="a">PACK: ${t.packaging.map((p) => `${p.quantity} × ${esc(p.name)}`).join(', ')}</div>` : ''}${lines}`);
  w.document.close(); w.focus(); w.print();

  return true;
}
