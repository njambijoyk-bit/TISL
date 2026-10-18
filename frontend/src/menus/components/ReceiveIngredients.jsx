import { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../core/components/admin/ui/Modal';
import menusAPI from '../../_shared/api/menus';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors, input } from '../../_shared/theme/tokens';

/**
 * Receive ingredients, laid out like a Purchase (Purchases, New purchase): who it came from and how it was paid, then the items, then what the books will post. The items are found by
 * searching the ingredient or its variant; each line is typed in packs, the bigger unit or the base unit, with the price of one of that. The tax follows the ingredient's purchase account.
 * It saves the same Purchase voucher the Purchases page makes, and the lots go on the kitchen's shelf.
 */

const small = { ...input, padding: '6px 8px', fontSize: '0.8rem' };
const label = { display: 'block', fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, marginBottom: 3 };
const num = (n, dp = 2) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-KE', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
const key = () => Math.random().toString(36).slice(2);
const per = (v, unit) => (unit === 'pack' ? v.pack_size_base ?? 1 : unit === 'alt' ? v.alt_factor ?? 1 : 1);
const unitsOf = (v) => [...(v.pack_size_base ? [['pack', `pack (${v.pack_size_base} ${v.base_unit})`]] : []), ...(v.alt_unit ? [['alt', v.alt_unit]] : []), ['base', v.base_unit]];
const firstUnit = (v) => (v.pack_size_base ? 'pack' : v.alt_unit ? 'alt' : 'base');
const suggest = (v, unit) => (v.book_cost > 0 ? Math.round(v.book_cost * per(v, unit) * 10000) / 10000 : '');
const lineAmount = (l) => Math.max(0, (Number(l.quantity) || 0) * (Number(l.rate) || 0) - (Number(l.discount) || 0));

/** Search over the ingredients and their variants: type part of either, pick the variant. */
function ItemSearch({ variants, onPick }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  const needle = q.trim().toLowerCase();
  const rows = variants.filter((v) => !needle || `${v.ingredient} ${v.name}`.toLowerCase().includes(needle)).slice(0, 40);

  return (
    <div style={{ position: 'relative' }}>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => { clearTimeout(closeTimer.current); setOpen(true); }} onBlur={() => { closeTimer.current = setTimeout(() => setOpen(false), 180); }}
        placeholder="Search an item…" style={small} aria-label="Search items" />
      {open && (
        <div style={{ position: 'absolute', zIndex: 30, top: '100%', left: 0, right: 0, minWidth: 320, maxHeight: 300, overflowY: 'auto', ...card, padding: 4 }}>
          {rows.length === 0 && <p style={{ margin: 8, fontSize: '0.78rem', color: colors.textMuted }}>{q ? `Nothing matches “${q}”.` : 'No items with variants yet: add them under Ingredients & Supplies.'}</p>}
          {rows.map((v) => (
            <button key={v.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(v); setQ(''); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>
              {v.ingredient} <span style={{ color: colors.textFaint }}>↳ {v.name}</span>
              {v.track_expiry && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: colors.primary, fontWeight: 700 }}>EXPIRY</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReceiveIngredients({ data, locationId, onClose, onDone }) {
  const variants = useMemo(() => data.ingredients.filter((i) => i.is_active).flatMap((i) => i.variants.filter((v) => v.is_active).map((v) => ({
    id: v.id, name: v.name, ingredient: i.name, pack_size_base: v.pack_size_base, track_expiry: v.track_expiry, base_unit: i.base_unit, alt_unit: i.alt_unit, alt_factor: i.alt_factor ?? 1, book_cost: v.book_cost,
  }))), [data]);
  const [h, setH] = useState({ loc: String(locationId), date: new Date().toLocaleDateString('en-CA'), supplier: '', method: '', invoice: '', ref: '', due: '', note: '' });
  const [lines, setLines] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (p) => setH((x) => ({ ...x, ...p }));
  const patch = (k, p) => setLines((xs) => xs.map((x) => (x.key === k ? { ...x, ...p } : x)));
  const add = (v) => setLines((xs) => [...xs, { key: key(), v, quantity: 1, unit: firstUnit(v), rate: suggest(v, firstUnit(v)), rate_auto: suggest(v, firstUnit(v)) !== '', discount: '', batch_no: '', expiry_date: '' }]);
  const paidNow = Boolean(h.method);
  const subtotal = lines.reduce((s, l) => s + lineAmount(l), 0);

  const payload = useMemo(() => ({
    location_id: Number(h.loc), date: h.date, narration: h.note || null, reference_no: h.ref || null, supplier_invoice_no: h.invoice || null, due_date: h.due || null,
    supplier_ledger_id: h.supplier ? Number(h.supplier) : null, payment_method_id: h.method ? Number(h.method) : null,
    lines: lines.map((l) => ({ item_id: l.v.id, quantity: Number(l.quantity), unit: l.unit, rate: Number(l.rate), discount: Number(l.discount) || 0, batch_no: l.batch_no || null, expiry_date: l.expiry_date || null })),
  }), [h, lines]);

  const missing = [
    ...lines.filter((l) => l.v.track_expiry && !l.expiry_date).map((l) => `${l.v.ingredient} ${l.v.name} needs its expiry date`),
    ...(lines.length > 0 && !h.supplier && !h.method ? ['choose the supplier or how it was paid'] : []),
    ...lines.filter((l) => !(Number(l.quantity) > 0) || l.rate === '').map((l) => `${l.v.ingredient} ${l.v.name} needs a quantity and a cost`),
  ];
  const ready = lines.length > 0 && missing.length === 0;

  useEffect(() => {
    if (!ready) { setPreview(null); setPreviewErr(null); return undefined; }
    const t = setTimeout(() => { menusAPI.previewReceive(payload).then((p) => { setPreview(p); setPreviewErr(null); }).catch((e) => { setPreview(null); setPreviewErr(errMsg(e, 'Could not work out this delivery')); }); }, 500);
    return () => clearTimeout(t);
  }, [payload, ready]);

  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await menusAPI.receiveStock(payload);
      toast.success(res.message, { duration: 6000 }); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save')); } finally { setBusy(false); }
  };

  return (
    <Modal title="Receive stock" onClose={onClose} width={1040}>
      <form onSubmit={go} style={{ display: 'grid', gap: 14 }}>
        <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Stock you buy{data.currency?.code ? ` (prices in ${data.currency.code})` : ''}. It goes on the branch's shelf at the cost you enter, and is owed to the supplier (or paid for at once). The tax follows each ingredient's purchase account.</p>
        <div style={{ ...card, padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
          <div>
            <label style={label}>{paidNow ? 'Supplier (optional)' : 'Supplier'}</label>
            <select aria-label="Supplier" value={h.supplier} onChange={(e) => set({ supplier: e.target.value })} style={small}>
              <option value="">{paidNow ? 'Not a vendor…' : 'Choose…'}</option>{data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Payment</label>
            <select aria-label="Payment" value={h.method} onChange={(e) => set({ method: e.target.value })} style={small}>
              <option value="">On credit — we owe the supplier</option>{(data.payment_methods ?? []).map((m) => <option key={m.id} value={m.id}>Paid at once — {m.name}</option>)}
            </select>
          </div>
          <div><label style={label}>Date</label><input type="date" aria-label="Date" required value={h.date} onChange={(e) => set({ date: e.target.value })} style={small} /></div>
          <div>
            <label style={label}>Received at branch</label>
            <select aria-label="Branch" required value={h.loc} onChange={(e) => set({ loc: e.target.value })} style={small}>{data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </div>
          <div><label style={label}>Supplier invoice no.</label><input aria-label="Supplier invoice number" maxLength={60} value={h.invoice} onChange={(e) => set({ invoice: e.target.value })} style={small} /></div>
          <div><label style={label}>Ref (LPO, delivery note…)</label><input aria-label="Reference" maxLength={60} value={h.ref} onChange={(e) => set({ ref: e.target.value })} style={small} /></div>
          <div><label style={label}>Due date</label><input type="date" aria-label="Due date" value={h.due} onChange={(e) => set({ due: e.target.value })} style={small} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={label}>Narration</label><input aria-label="Narration" maxLength={255} value={h.note} onChange={(e) => set({ note: e.target.value })} style={small} /></div>
        </div>

        <div style={{ ...card, padding: 14 }}>
          <div style={{ marginBottom: 10 }}><ItemSearch variants={variants} onPick={add} /></div>
          {lines.length === 0 ? <p style={{ fontSize: '0.8rem', color: colors.textMuted, margin: 0 }}>No items yet. Search above.</p> : (
            <div style={{ display: 'grid', gap: 10 }}>
              {lines.map((l) => (
                <div key={l.key} style={{ border: `1px solid ${colors.tint(0.12)}`, borderRadius: 10, padding: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,2fr) 130px 80px 100px 90px 100px 30px', gap: 8, alignItems: 'end' }}>
                    <div>
                      <label style={label}>Item</label>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{l.v.ingredient}</div>
                      <div style={{ fontSize: '0.74rem', color: colors.textMuted }}>↳ {l.v.name}</div>
                    </div>
                    <div>
                      <label style={label}>Unit</label>
                      <select aria-label="Unit" value={l.unit} onChange={(e) => patch(l.key, { unit: e.target.value, ...(l.rate_auto && suggest(l.v, e.target.value) !== '' ? { rate: suggest(l.v, e.target.value) } : {}) })} style={small}>
                        {unitsOf(l.v).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                      </select>
                    </div>
                    <div><label style={label}>Qty</label><input type="number" min="0" step="any" aria-label="Quantity" value={l.quantity} onChange={(e) => patch(l.key, { quantity: e.target.value })} style={small} /></div>
                    <div><label style={label}>Cost each</label><input type="number" min="0" step="any" aria-label="Price" value={l.rate} onChange={(e) => patch(l.key, { rate: e.target.value, rate_auto: false })} style={small} /></div>
                    <div><label style={label}>Discount</label><input type="number" min="0" step="any" aria-label="Discount" value={l.discount} onChange={(e) => patch(l.key, { discount: e.target.value })} style={small} /></div>
                    <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.85rem' }}>{num(lineAmount(l))}</div>
                    <button type="button" aria-label="Remove line" onClick={() => setLines((xs) => xs.filter((y) => y.key !== l.key))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint }}><Trash2 size={15} /></button>
                  </div>
                  {per(l.v, l.unit) !== 1 && Number(l.quantity) > 0 && (
                    <div style={{ fontSize: '0.7rem', color: colors.textFaint, marginTop: 4 }}>= {num(Number(l.quantity) * per(l.v, l.unit), 4)} {l.v.base_unit}{Number(l.rate) > 0 ? ` at ${num(Number(l.rate) / per(l.v, l.unit), 4)} each` : ''}</div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginTop: 8 }}>
                    <div><label style={label}>Batch no.</label><input aria-label="Batch number" maxLength={60} value={l.batch_no} onChange={(e) => patch(l.key, { batch_no: e.target.value })} style={small} /></div>
                    {l.v.track_expiry && <div><label style={label}>Expiry date *</label><input type="date" aria-label="Expiry date" value={l.expiry_date} onChange={(e) => patch(l.key, { expiry_date: e.target.value })} style={small} /></div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!preview?.entries?.length && !previewErr && missing.length > 0 && lines.length > 0 && (
          <div role="status" style={{ ...card, padding: 14, fontSize: '0.8rem', color: colors.textMuted }}>The accounting entries and the tax show once everything is filled in: {missing.join('; ')}.</div>
        )}
        {preview?.entries?.length > 0 && (
          <div style={{ ...card, padding: 14 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, color: colors.text }}>What this will post</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead><tr><th style={{ textAlign: 'left', padding: 4, fontSize: '0.65rem', color: colors.textFaint }} /><th style={{ textAlign: 'left', fontSize: '0.65rem', color: colors.textFaint }}>Ledger</th><th style={{ textAlign: 'right', fontSize: '0.65rem', color: colors.textFaint }}>Debit</th><th style={{ textAlign: 'right', fontSize: '0.65rem', color: colors.textFaint }}>Credit</th></tr></thead>
              <tbody>{preview.entries.map((e, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${colors.tint(0.05)}` }}>
                  <td style={{ padding: '5px 4px', width: 40, color: colors.textFaint }}>{e.side === 'D' ? 'Dr' : 'Cr'}</td>
                  <td style={{ paddingLeft: e.side === 'C' ? 18 : 0 }}>{e.ledger}</td>
                  <td style={{ textAlign: 'right' }}>{e.side === 'D' ? num(e.amount) : ''}</td>
                  <td style={{ textAlign: 'right' }}>{e.side === 'C' ? num(e.amount) : ''}</td>
                </tr>
              ))}</tbody>
            </table>
            {(preview.tax_breakdown ?? []).length > 0 && <p style={{ margin: '8px 0 0', fontSize: '0.74rem', color: colors.textMuted }}>Input tax claimed: {preview.tax_breakdown.map((t) => `${t.label} ${num(t.amount)}`).join(' · ')}</p>}
          </div>
        )}

        <div style={{ ...card, padding: 14 }}>
          <div style={{ display: 'flex', gap: 24, justifyContent: 'flex-end', flexWrap: 'wrap', fontSize: '0.85rem' }}>
            <div>Subtotal <strong>{num(preview?.subtotal ?? subtotal)}</strong></div>
            <div>Tax <strong>{preview ? num(preview.tax_total ?? 0) : '—'}</strong></div>
            <div>Total <strong style={{ color: colors.primary }}>{preview ? num(preview.total) : '—'}</strong></div>
          </div>
          {previewErr && <p role="alert" style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#b91c1c' }}>{previewErr}</p>}
          {err && <p role="alert" style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#b91c1c' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" style={btnGhost} onClick={onClose}>Cancel</button>
            <button type="submit" data-hotkey="Save" style={{ ...btnPrimary, opacity: ready && !busy ? 1 : 0.6 }} disabled={!ready || busy}>{busy ? 'Saving…' : 'Post purchase'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
