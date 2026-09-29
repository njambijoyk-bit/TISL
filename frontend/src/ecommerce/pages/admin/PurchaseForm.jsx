import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, PackagePlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import CurrencySelect from '../../../_shared/components/common/currency/CurrencySelect';
import { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import { money, today } from '../../../core/components/admin/books/booksFmt';
import booksAPI from '../../../_shared/api/books';
import locationsAPI from '../../../_shared/api/locations';
import useAuthStore from '../../../_shared/store/authStore';
import { canWriteFinance } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors, input } from '../../../_shared/theme/tokens';

/**
 * Purchases, Goods received notes and Opening stock: stock coming in, entered as a voucher.
 *
 * Items are picked from product variants. Nothing found? Near matches are offered,
 * then "Create new product" — which goes to the ordinary product form and comes back
 * here with the new product's variant on the line. The half-filled purchase is kept
 * in the browser while the admin is away, so nothing typed is lost.
 *
 * Batch number and expiry are only asked for on products that track expiry.
 */

const small = { ...input, padding: '6px 8px', fontSize: '0.8rem' };
const label = { display: 'block', fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, marginBottom: 3 };
const newKey = () => Math.random().toString(36).slice(2);

const draftKey = (kind, id) => `purchase-draft:${kind}:${id ?? 'new'}`;
const readDraft = (key) => { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } };
const writeDraft = (key, v) => { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode etc. — the draft is a convenience */ } };
const clearDraft = (key) => { try { sessionStorage.removeItem(key); } catch { /* ignore */ } };

const blankHeader = () => ({ date: today(), location_id: '', party_ledger_id: '', currency_id: '', exchange_rate: '', reference_no: '', due_date: '', narration: '', opening_ledger_id: '' });
const blankOther = () => ({ key: newKey(), other: true, description: '', quantity: 1, rate: '', ledger_id: '' });

/** A purchase line from a picked variant row (units limited to the ones you can buy in). */
const lineFrom = (row, currencyIsBase) => {
  const units = (row.units ?? []).filter((u) => u.is_purchasable !== false);
  const unit = units.find((u) => u.role === 'base') ?? units[0];
  const suggested = currencyIsBase && row.last_cost > 0 && unit ? Math.round(row.last_cost * unit.base_factor * 10000) / 10000 : '';
  return {
    key: newKey(), variant_id: row.variant_id, product_id: row.product_id,
    label: `${row.product}${row.variant && row.variant !== 'Standard' ? ` — ${row.variant}` : ''}`, sku: row.sku,
    units, variant_unit_id: unit?.id ?? '', quantity: 1, rate: suggested, rate_auto: suggested !== '', discount: '',
    track_expiry: Boolean(row.track_expiry), last_cost: row.last_cost ?? 0, batch_no: '', mfg_date: '', expiry_date: '',
  };
};

/** Search-as-you-type over product variants, with near matches and "create new product". */
function ItemSearch({ onPick, onCreate, onAddVariant }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => { booksAPI.lookup('product', q, 'purchase').then(setRows).catch(() => setRows([])); }, 200);
    return () => clearTimeout(t);
  }, [q, open]);
  const fuzzy = rows.length > 0 && rows[0].fuzzy;
  return (
    <div style={{ position: 'relative' }}>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => { clearTimeout(closeTimer.current); setOpen(true); }} onBlur={() => { closeTimer.current = setTimeout(() => setOpen(false), 180); }}
        placeholder="Search a product or SKU to add…" style={small} aria-label="Search products" />
      {open && (
        <div style={{ position: 'absolute', zIndex: 30, top: '100%', left: 0, right: 0, minWidth: 320, maxHeight: 340, overflowY: 'auto', ...card, padding: 4 }}>
          {rows.length === 0 && <p style={{ margin: 8, fontSize: '0.78rem', color: colors.textMuted }}>{q ? `Nothing matches “${q}”.` : 'Start typing to search.'}</p>}
          {fuzzy && <p style={{ margin: '6px 9px', fontSize: '0.72rem', color: colors.textMuted }}>No exact match — did you mean:</p>}
          {rows.map((r) => (
            <div key={r.variant_id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(r); setQ(''); setOpen(false); }}
                style={{ flex: 1, textAlign: 'left', padding: '7px 9px', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>
                {r.product} <span style={{ color: colors.textFaint }}>{r.variant && r.variant !== 'Standard' ? `${r.variant} · ` : ''}{r.sku}</span>
                {r.track_expiry && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: colors.primary, fontWeight: 700 }}>EXPIRY</span>}
                {!r.for_sale && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: colors.textFaint, fontWeight: 700 }}>MATERIAL</span>}
              </button>
              <button type="button" title={`Add another variant of ${r.product}`} onMouseDown={(e) => e.preventDefault()} onClick={() => onAddVariant(r.product_id)}
                style={{ padding: '4px 8px', background: 'none', border: `1px solid ${colors.tint(0.18)}`, borderRadius: 6, cursor: 'pointer', fontSize: '0.68rem', color: colors.textMuted, whiteSpace: 'nowrap' }}>
                + variant
              </button>
            </div>
          ))}
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onCreate(q)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '9px', marginTop: 2, background: colors.tint(0.05), border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: colors.primary }}>
            <PackagePlus size={14} /> Create new product{q ? ` “${q}”` : ''}
          </button>
        </div>
      )}
    </div>
  );
}

export default function PurchaseForm({ kind = 'purchase' }) {
  const nav = useNavigate();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const editing = Boolean(id);
  const canWrite = canWriteFinance(user);

  const [mode, setMode] = useState(kind);               // 'purchase' | 'receipt' | 'opening' — becomes the voucher's own kind when editing
  const opening = mode === 'opening';
  const receipt = mode === 'receipt';
  const noun = opening ? 'opening stock' : receipt ? 'goods received note' : 'purchase';
  const baseType = opening ? 'opening_stock' : receipt ? 'receipt_note' : 'purchase';
  const listPath = opening ? '/admin/stock/opening' : receipt ? '/admin/purchases?tab=receipt_note' : '/admin/purchases';
  const selfPath = editing ? `/admin/purchases/${id}/edit` : (opening ? '/admin/stock/opening/new' : receipt ? '/admin/purchases/receipt/new' : '/admin/purchases/new');
  const key = draftKey(kind, id);

  const draft0 = useMemo(() => (editing ? null : readDraft(key)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [types, setTypes] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [h, setH] = useState(() => ({ ...blankHeader(), ...(draft0?.h ?? {}) }));
  const [lines, setLines] = useState(() => draft0?.lines ?? []);
  const [loading, setLoading] = useState(editing);
  const [choose, setChoose] = useState(null);           // variants of a product just created / changed, to pick from
  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const [restored, setRestored] = useState(Boolean(draft0));
  const handledProduct = useRef(false);

  const type = types.find((t) => t.base_type === baseType && t.is_active);
  const currencyIsBase = !h.currency_id;

  useEffect(() => {
    booksAPI.types().then(setTypes).catch((e) => toast.error(errMsg(e, 'Could not load voucher types')));
    booksAPI.ledgers({ all: 1, active_only: 1 }).then((r) => setLedgers(Array.isArray(r) ? r : r.data ?? [])).catch(() => {});
    locationsAPI.getAdmin().then((r) => {
      const act = (r.locations ?? []).filter((l) => l.is_active !== false);
      setBranches(act);
      setH((x) => (x.location_id ? x : { ...x, location_id: (act.find((l) => l.is_default) ?? act[0])?.id ?? '' }));
    }).catch(() => {});
  }, []);

  // Editing: load the voucher (a kept draft, made before the admin left to create a product, wins)
  useEffect(() => {
    if (!editing) return;
    booksAPI.voucher(id).then(async (v) => {
      const base = v.type?.base_type;
      if (!['purchase', 'receipt_note', 'opening_stock'].includes(base)) { nav(`/admin/books/vouchers/${id}/edit`, { replace: true }); return; }
      if ((v.items ?? []).some((i) => !['product', 'custom', 'charge'].includes(i.item_type))) { nav(`/admin/books/vouchers/${id}/edit`, { replace: true }); return; }
      setMode(base === 'opening_stock' ? 'opening' : base === 'receipt_note' ? 'receipt' : 'purchase');
      const d = readDraft(key);
      if (d) { setH({ ...blankHeader(), ...d.h }); setLines(d.lines ?? []); setRestored(true); return; }
      setH({ ...blankHeader(), date: v.date, location_id: v.location_id ?? '', party_ledger_id: v.party_ledger_id ?? '', currency_id: v.currency?.code && v.exchange_rate && Number(v.exchange_rate) !== 1 ? v.currency_id : '', exchange_rate: Number(v.exchange_rate) !== 1 ? v.exchange_rate : '', reference_no: v.reference_no ?? '', due_date: v.due_date ?? '', narration: v.narration ?? '' });
      const products = [...new Set((v.items ?? []).filter((i) => i.item_type === 'product').map((i) => i.product_id))];
      const info = {};
      await Promise.all(products.map((pid) => booksAPI.productVariants(pid).then((rows) => rows.forEach((r) => { info[r.variant_id] = r; })).catch(() => {})));
      setLines((v.items ?? []).map((i) => {
        if (i.item_type !== 'product') return { key: `i${i.id}`, other: true, description: i.description, quantity: Number(i.quantity), rate: Number(i.item_type === 'charge' ? i.amount : i.rate), ledger_id: i.ledger_id ?? '' };
        const r = info[i.variant_id];
        const base0 = r ? lineFrom(r, false) : { units: [], track_expiry: Boolean(i.batch_no || i.expiry_date) };
        return { ...base0, key: `i${i.id}`, variant_id: i.variant_id, product_id: i.product_id, label: `${i.description}${i.variant_label && i.variant_label !== 'Standard' ? ` — ${i.variant_label}` : ''}`,
          variant_unit_id: i.variant_unit_id ?? base0.variant_unit_id, quantity: Number(i.quantity), rate: Number(i.rate), rate_auto: false, discount: Number(i.discount_amount) || '',
          batch_no: i.batch_no ?? '', mfg_date: i.mfg_date ?? '', expiry_date: i.expiry_date ?? '' };
      }));
    }).catch((e) => toast.error(errMsg(e, 'Could not load the purchase'))).finally(() => setLoading(false));
  }, [id, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the half-filled purchase while the admin is away creating a product
  useEffect(() => {
    if (loading) return;
    writeDraft(key, { h, lines });
  }, [h, lines, loading, key]);

  const addVariant = (row) => setLines((ls) => [...ls, lineFrom(row, currencyIsBase)]);
  const setLine = (k, patch) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const removeLine = (k) => setLines((ls) => ls.filter((l) => l.key !== k));

  // Back from the product form: the new / changed product's variant goes on the purchase
  useEffect(() => {
    const pid = params.get('product');
    if (!pid || loading || handledProduct.current) return;
    handledProduct.current = true;
    booksAPI.productVariants(pid)
      .then((rows) => { if (rows.length === 1) { addVariant(rows[0]); toast.success(`${rows[0].product} added to the purchase`); } else if (rows.length > 1) setChoose(rows); })
      .catch((e) => toast.error(errMsg(e, 'Could not load the product')))
      .finally(() => setParams((p) => { p.delete('product'); return p; }, { replace: true }));
  }, [params, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const goProduct = (path, extra = '') => {
    writeDraft(key, { h, lines });
    nav(`${path}?returnTo=${encodeURIComponent(selfPath)}${extra}`);
  };
  const createProduct = (name) => goProduct('/admin/products/create', name ? `&name=${encodeURIComponent(name)}` : '');
  const addVariantTo = (productId) => goProduct(`/admin/products/${productId}/edit`, '&tab=variants');

  const payload = useMemo(() => {
    const p = {
      voucher_type_id: type?.id, date: h.date, location_id: h.location_id || null, reference_no: h.reference_no || null, narration: h.narration || null,
      currency_id: h.currency_id || null, exchange_rate: h.exchange_rate === '' ? undefined : Number(h.exchange_rate),
      lines: lines.map((l) => (l.other
        ? { type: 'custom', description: l.description, quantity: Number(l.quantity) || 1, rate: Number(l.rate) || 0, ledger_id: l.ledger_id || undefined }
        : { type: 'product', variant_id: l.variant_id, variant_unit_id: l.variant_unit_id || undefined, quantity: Number(l.quantity) || 0,
          rate: l.rate === '' ? undefined : Number(l.rate), discount: Number(l.discount) || 0,
          batch_no: l.track_expiry || l.batch_no ? l.batch_no || undefined : undefined, mfg_date: l.mfg_date || undefined, expiry_date: l.expiry_date || undefined })),
    };
    if (opening) p.opening_ledger_id = h.opening_ledger_id || undefined;
    else { p.party_ledger_id = h.party_ledger_id || null; p.due_date = receipt ? null : h.due_date || null; }
    return p;
  }, [type, h, lines, opening]);

  const ready = Boolean(type) && lines.length > 0 && lines.every((l) => (l.other ? l.description && l.rate !== '' && l.ledger_id : l.variant_id && Number(l.quantity) > 0 && l.rate !== '')) && (opening || Boolean(h.party_ledger_id));

  useEffect(() => {
    if (!ready) { setPreview(null); setPreviewErr(null); return undefined; }
    const t = setTimeout(() => {
      booksAPI.previewVoucher(payload).then((p) => { setPreview(p); setPreviewErr(null); }).catch((e) => { setPreview(null); setPreviewErr(errMsg(e, 'Could not work out this purchase')); });
    }, 500);
    return () => clearTimeout(t);
  }, [payload, ready]);

  const save = async () => {
    setSaving(true); setSaveErr(null);
    try {
      const res = editing ? await booksAPI.updateVoucher(id, payload) : await booksAPI.createVoucher(payload);
      clearDraft(key);
      toast.success(res.message ?? 'Saved');
      nav(`/admin/books/vouchers/${res.data.id}`);
    } catch (e) { const m = errMsg(e, 'Could not save'); setSaveErr(m); toast.error(m, { duration: 7000 }); }
    finally { setSaving(false); }
  };

  const discard = () => {
    clearDraft(key);
    setH({ ...blankHeader(), location_id: h.location_id });
    setLines([]); setRestored(false); setPreview(null);
  };

  const suppliers = ledgers.filter((l) => l.group?.name === 'Sundry Creditors');
  const lineAmount = (l) => Math.max(0, (Number(l.quantity) || 0) * (Number(l.rate) || 0) - (Number(l.discount) || 0));
  const subtotal = lines.reduce((s, l) => s + lineAmount(l), 0);

  if (!canWrite) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="purchases" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '28px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <Link to={listPath} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.78rem', color: colors.textMuted, textDecoration: 'none', marginBottom: 10 }}><ArrowLeft size={14} /> {opening ? 'Opening stock' : 'Purchases'}</Link>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: colors.primary, margin: '0 0 6px' }}>{editing ? 'Edit' : 'New'} {noun}</h1>
        <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: colors.textMuted }}>
          {opening ? 'Stock you already hold when you start using the system: quantity and what each unit cost. It is balanced against the opening balance ledger.'
            : receipt ? 'Goods that arrived before the supplier’s invoice. The stock is added now, at the cost you enter; the money is booked when you turn this into a purchase.'
              : 'Stock you buy. It is added to the branch you choose, at the cost you enter, and owed to the supplier.'}
        </p>

        {restored && (
          <div style={{ ...card, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.78rem', color: colors.textMuted }}>
            <span style={{ flex: 1 }}>Your unfinished {noun} was kept — carry on where you left off.</span>
            <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' }} onClick={discard}>Discard it</button>
            <button type="button" aria-label="Dismiss" onClick={() => setRestored(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint }}><X size={14} /></button>
          </div>
        )}

        {!type && types.length > 0 && (
          <div style={{ ...card, padding: 14, marginBottom: 12, color: '#b91c1c', fontSize: '0.8rem' }}>
            {opening ? 'The Opening Stock voucher type is not set up yet — run script 24_purchase_batches_and_opening_stock.sql.' : `The ${receipt ? 'Receipt Note' : 'Purchase'} voucher type is switched off.`}
          </div>
        )}

        {loading ? <p style={{ color: colors.textMuted }}>Loading…</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 16 }}>
            <div style={{ ...card, padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
              {!opening && (
                <div>
                  <label style={label}>Supplier</label>
                  <select value={h.party_ledger_id} onChange={(e) => setH((x) => ({ ...x, party_ledger_id: e.target.value }))} style={small}>
                    <option value="">Choose…</option>
                    {suppliers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              <div><label style={label}>Date</label><input type="date" value={h.date} onChange={(e) => setH((x) => ({ ...x, date: e.target.value }))} style={small} /></div>
              <div>
                <label style={label}>Received at branch</label>
                <select value={h.location_id} onChange={(e) => setH((x) => ({ ...x, location_id: e.target.value }))} style={small}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              {opening ? (
                <div>
                  <label style={label}>Balanced against</label>
                  <select value={h.opening_ledger_id} onChange={(e) => setH((x) => ({ ...x, opening_ledger_id: e.target.value }))} style={small}>
                    <option value="">Default (Opening Stock Balance)</option>
                    {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              ) : (
                <>
                  <div><label style={label}>{receipt ? 'Delivery note no.' : 'Supplier invoice no.'}</label><input value={h.reference_no} onChange={(e) => setH((x) => ({ ...x, reference_no: e.target.value }))} style={small} /></div>
                  {!receipt && <div><label style={label}>Due date</label><input type="date" value={h.due_date} onChange={(e) => setH((x) => ({ ...x, due_date: e.target.value }))} style={small} /></div>}
                  <div>
                    <label style={label}>Currency</label>
                    <CurrencySelect value={h.currency_id} onChange={(v) => setH((x) => ({ ...x, currency_id: v }))} allowEmpty emptyLabel="Base currency" style={small} />
                  </div>
                  {h.currency_id && <div><label style={label}>Exchange rate</label><input type="number" step="any" value={h.exchange_rate} onChange={(e) => setH((x) => ({ ...x, exchange_rate: e.target.value }))} placeholder="Blank = the day's rate" style={small} /></div>}
                </>
              )}
              <div style={{ gridColumn: '1 / -1' }}><label style={label}>Narration</label><input value={h.narration} onChange={(e) => setH((x) => ({ ...x, narration: e.target.value }))} style={small} /></div>
            </div>

            <div style={{ ...card, padding: 18 }}>
              <div style={{ marginBottom: 12 }}>
                <ItemSearch onPick={addVariant} onCreate={createProduct} onAddVariant={addVariantTo} />
              </div>

              {choose && (
                <div style={{ ...card, padding: 12, marginBottom: 12, background: colors.tint(0.04) }}>
                  <p style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 700 }}>Which variant of {choose[0].product} did you buy?</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {choose.map((r) => (
                      <button key={r.variant_id} type="button" style={{ ...btnGhost, padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => { addVariant(r); }}>
                        {r.variant && r.variant !== 'Standard' ? r.variant : 'Standard'} · {r.sku}
                      </button>
                    ))}
                    <button type="button" style={{ ...btnGhost, padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => setChoose(null)}>Done</button>
                  </div>
                </div>
              )}

              {lines.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: colors.textMuted, margin: 0 }}>No items yet. Search above, or create a new product if it is not in the system.</p>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {lines.map((l) => (
                    <div key={l.key} style={{ border: `1px solid ${colors.tint(0.12)}`, borderRadius: 10, padding: 10 }}>
                      {l.other ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,2fr) 70px 100px minmax(120px,1fr) 100px 30px', gap: 8, alignItems: 'end' }}>
                          <div><label style={label}>Other charge (freight, duty…)</label><input value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} style={small} /></div>
                          <div><label style={label}>Qty</label><input type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} style={small} /></div>
                          <div><label style={label}>Amount each</label><input type="number" min="0" step="any" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} style={small} /></div>
                          <div>
                            <label style={label}>Ledger *</label>
                            <select value={l.ledger_id} onChange={(e) => setLine(l.key, { ledger_id: e.target.value })} style={small}>
                              <option value="">Choose…</option>
                              {ledgers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                          </div>
                          <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.85rem' }}>{money(lineAmount(l))}</div>
                          <button type="button" aria-label="Remove line" onClick={() => removeLine(l.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint }}><Trash2 size={15} /></button>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,2fr) 100px 70px 100px 90px 100px 30px', gap: 8, alignItems: 'end' }}>
                            <div>
                              <label style={label}>Item</label>
                              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{l.label}</div>
                              <div style={{ fontSize: '0.68rem', color: colors.textFaint }}>{l.sku}</div>
                            </div>
                            <div>
                              <label style={label}>Unit</label>
                              <select value={l.variant_unit_id} onChange={(e) => {
                                const u = l.units.find((x) => String(x.id) === e.target.value);
                                setLine(l.key, { variant_unit_id: e.target.value, ...(l.rate_auto && u && l.last_cost > 0 ? { rate: Math.round(l.last_cost * u.base_factor * 10000) / 10000 } : {}) });
                              }} style={small}>
                                {l.units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
                              </select>
                            </div>
                            <div><label style={label}>Qty</label><input type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} style={small} /></div>
                            <div><label style={label}>Cost each</label><input type="number" min="0" step="any" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value, rate_auto: false })} style={small} /></div>
                            <div><label style={label}>Discount</label><input type="number" min="0" step="any" value={l.discount} onChange={(e) => setLine(l.key, { discount: e.target.value })} style={small} /></div>
                            <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.85rem' }}>{money(lineAmount(l))}</div>
                            <button type="button" aria-label="Remove line" onClick={() => removeLine(l.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint }}><Trash2 size={15} /></button>
                          </div>
                          {l.track_expiry && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginTop: 8 }}>
                              <div><label style={label}>Batch no. *</label><input value={l.batch_no} onChange={(e) => setLine(l.key, { batch_no: e.target.value })} style={small} /></div>
                              <div><label style={label}>Manufactured</label><input type="date" value={l.mfg_date} onChange={(e) => setLine(l.key, { mfg_date: e.target.value })} style={small} /></div>
                              <div><label style={label}>Expiry date *</label><input type="date" value={l.expiry_date} onChange={(e) => setLine(l.key, { expiry_date: e.target.value })} style={small} /></div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <button type="button" style={{ ...btnGhost, padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => setLines((ls) => [...ls, blankOther()])}><Plus size={13} /> Other charge</button>
              </div>
            </div>

            <div style={{ ...card, padding: 18 }}>
              <div style={{ display: 'flex', gap: 24, justifyContent: 'flex-end', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                <div>Subtotal <strong>{money(preview?.subtotal ?? subtotal)}</strong></div>
                {!opening && !receipt && <div>Tax <strong>{money(preview?.tax_total ?? 0)}</strong></div>}
                <div>Total <strong style={{ color: colors.primary }}>{money(preview?.total ?? subtotal)}</strong></div>
              </div>
              {previewErr && <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#b91c1c' }}>{previewErr}</p>}
              {saveErr && <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#b91c1c' }}>{saveErr}</p>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
                <button type="button" style={btnGhost} onClick={() => nav(listPath)}>Cancel</button>
                <button type="button" style={{ ...btnPrimary, opacity: ready && !saving ? 1 : 0.6 }} disabled={!ready || saving} onClick={save}>{saving ? 'Saving…' : editing ? 'Save changes' : opening ? 'Post opening stock' : receipt ? 'Post goods received' : 'Post purchase'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
