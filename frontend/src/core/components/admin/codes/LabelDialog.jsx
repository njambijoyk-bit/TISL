import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { Printer, X } from 'lucide-react';
import codesAPI from '../../../../_shared/api/codes';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { printHtml, sheetHtml, SIZES } from '../../../lib/codes/labelSheet';
import { btnGhost, btnPrimary, colors } from '../../../../_shared/theme/tokens';

const sel = { padding: '7px 9px', borderRadius: 8, border: '1.5px solid var(--line, #d1d5db)', background: 'var(--surface-input, #fff)', color: 'inherit', fontFamily: 'inherit', fontSize: '0.82rem' };

/**
 * Choose what goes on the labels, how many of each and the sheet or roll, see them exactly as they will print, and print. `items` are rows from the Codes page
 * ({ type, id, label, code, copies? }). Items without a code are listed as skipped (give them one first).
 */
export default function LabelDialog({ items, defaults, kinds, onClose }) {
  const [copies, setCopies] = useState(() => Object.fromEntries(items.map((i) => [`${i.type}:${i.id}`, 1])));
  const [opt, setOpt] = useState({ name: defaults.name, sku: defaults.sku, price: defaults.price, code_text: defaults.code_text, batch: defaults.batch });
  const [kind, setKind] = useState('');
  const [size, setSize] = useState(SIZES[defaults.size] ? defaults.size : 'a4-24');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  const body = useMemo(() => ({ items: items.map((i) => ({ type: i.type, id: i.id, copies: Math.max(1, Number(copies[`${i.type}:${i.id}`]) || 1) })), ...opt, ...(kind ? { kind } : {}), size, template: 'page' }), [items, copies, opt, kind, size]);

  // the server draws the labels (so a label shows exactly what a scan will read); asked again, after a pause, when something changes. A preview is not a print: nothing is logged until Print.
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      try { const r = await codesAPI.labels({ ...body, preview: true }); if (live) { setRes(r); setPreview(null); } }
      catch (e) { if (live) setPreview(errMsg(e, 'Could not make the labels')); }
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [body]);

  const sheet = useMemo(() => (res ? sheetHtml(res.labels, size) : null), [res, size]);
  const previewHtml = useMemo(() => (res ? sheetHtml(res.labels, size, { fit: true }).html : ''), [res, size]);
  const set = (k) => (e) => setOpt((o) => ({ ...o, [k]: e.target.checked }));

  const print = async () => {
    if (!sheet?.count) return;
    setBusy(true);
    try { await codesAPI.labels({ ...body, log: true }); await printHtml(sheet.html); onClose(); }
    catch (e) { toast.error(errMsg(e, 'Could not print')); } finally { setBusy(false); }
  };

  return createPortal(
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,10,30,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="Print labels" onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 980, maxHeight: '92vh', overflow: 'auto', background: 'var(--surface-card, #fff)', color: colors.text, borderRadius: 14, padding: 20, display: 'grid', gap: 14, boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Printer size={17} aria-hidden="true" /><strong style={{ flex: 1, fontSize: '1.05rem' }}>Print labels</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: colors.textFaint, marginBottom: 6 }}>HOW MANY OF EACH</div>
              <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflow: 'auto' }}>
                {items.map((i) => (
                  <label key={`${i.type}:${i.id}`} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.8rem' }}>
                    <input type="number" min="1" max="500" value={copies[`${i.type}:${i.id}`]} onChange={(e) => setCopies((c) => ({ ...c, [`${i.type}:${i.id}`]: e.target.value }))} aria-label={`Copies of ${i.label}`} style={{ ...sel, width: 70 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.label}</span>
                    {!i.code && <span style={{ color: colors.danger, fontSize: '0.7rem' }}>no code</span>}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: colors.textFaint, marginBottom: 6 }}>PRINT ON THE LABEL</div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.82rem' }}>
                {[['name', 'Name'], ['sku', 'SKU'], ['price', 'Price'], ['batch', 'Batch and expiry'], ['code_text', 'Digits under the code']].map(([k, l]) => (
                  <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!opt[k]} onChange={set(k)} /> {l}</label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 4, fontSize: '0.72rem', fontWeight: 700, color: colors.textFaint }}>KIND OF CODE
                <select value={kind} onChange={(e) => setKind(e.target.value)} style={sel} aria-label="Kind of code">
                  <option value="">Automatic (best for each item)</option>
                  {kinds.filter((k) => k.for_labels !== false).map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: '0.72rem', fontWeight: 700, color: colors.textFaint }}>SHEET OR ROLL
                <select value={size} onChange={(e) => setSize(e.target.value)} style={sel} aria-label="Sheet or roll">
                  {Object.entries(SIZES).map(([k, s]) => <option key={k} value={k}>{s.name}</option>)}
                </select>
              </label>
            </div>
            {res?.skipped?.length > 0 && (
              <div role="status" style={{ fontSize: '0.78rem', padding: '8px 10px', borderRadius: 10, background: 'color-mix(in srgb, #b45309 9%, transparent)', border: '1px solid color-mix(in srgb, #b45309 35%, transparent)' }}>
                <strong>Not printed:</strong>
                {res.skipped.map((s) => <div key={`${s.type}:${s.id}`}>{s.label ?? `#${s.id}`}: {s.reason}</div>)}
              </div>
            )}
            {preview && <p role="alert" style={{ margin: 0, color: colors.danger, fontSize: '0.8rem' }}>{preview}</p>}
          </div>

          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: colors.textFaint, marginBottom: 6 }}>
              PREVIEW {sheet ? `· ${sheet.count} label${sheet.count === 1 ? '' : 's'}${SIZES[size].kind === 'sheet' ? ` on ${sheet.pages} page${sheet.pages === 1 ? '' : 's'}` : ''}` : ''}
            </div>
            <iframe title="Label preview" srcDoc={previewHtml} sandbox="allow-scripts" style={{ width: '100%', height: 360, border: `1px solid ${colors.tint(0.12)}`, borderRadius: 10, background: '#e5e7eb' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={btnGhost} onClick={onClose}>Close</button>
          <button type="button" style={{ ...btnPrimary, opacity: sheet?.count ? 1 : 0.5 }} disabled={busy || !sheet?.count} onClick={print}><Printer size={13} /> {busy ? 'Printing…' : 'Print'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
