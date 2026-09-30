import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import { NoAccess } from '../../../components/admin/ui/HubHeader';
import booksAPI from '../../../../_shared/api/books';
import locationsAPI from '../../../../_shared/api/locations';
import useAuthStore from '../../../../_shared/store/authStore';
import { canWriteFinance } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors, input } from '../../../../_shared/theme/tokens';
import shippingAPI from '../../../../_shared/api/shipping';
import taxAPI from '../../../../_shared/api/tax';
import { money, today } from '../../../components/admin/books/booksFmt';

// Sales-side voucher bases sell to customers; the rest buy or adjust, so they may pick "not for sale" materials.
const SALES_SIDE = ['quotation', 'sales_order', 'delivery_note', 'sales', 'cash_sale', 'credit_note'];

const small = { ...input, padding: '6px 8px', fontSize: '0.8rem' };
const label = { display: 'block', fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, marginBottom: 3 };

/** Search-as-you-type picker over /admin/books/lookup. */
function Picker({ api, kind, purpose, placeholder, onPick, render }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => { api.lookup(kind, q, purpose).then(setRows).catch(() => setRows([])); }, 200);
    return () => clearTimeout(t);
  }, [api, q, open, kind, purpose]);
  return (
    <div style={{ position: 'relative' }}>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder} style={small} aria-label={placeholder} />
      {open && (
        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, minWidth: 260, maxHeight: 260, overflowY: 'auto', ...card, padding: 4 }}>
          {rows.length === 0 ? <p style={{ margin: 8, fontSize: '0.78rem', color: colors.textMuted }}>No matches.</p> : rows.map((r, i) => (
            <button key={i} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(r); setQ(''); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>
              {render(r)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Which batch a sale line takes from — automatic (first expiring) unless the seller picks one. Shown for products that track expiry. */
function BatchPick({ api, variantId, locationId, value, onChange }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let live = true;
    (api.stockBatches ?? booksAPI.stockBatches)(variantId, locationId || undefined).then((r) => { if (live) setRows(r); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [api, variantId, locationId]);
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={{ ...small, marginTop: 4 }} aria-label="Batch">
      <option value="">Batch: automatic (first expiring)</option>
      {rows.map((b) => <option key={b.id} value={b.id}>{b.batch_no || `#${b.id}`} · {b.expiry_date ? `exp ${b.expiry_date}` : 'no expiry'} · {b.quantity} left</option>)}
    </select>
  );
}

const MATERIAL_MODES = {
  included: { label: 'Included in the price', add: 'Included (from stock)' },
  charged: { label: 'Charged to the customer', add: 'Charged (from stock)' },
  bought_outside: { label: 'Bought elsewhere for this job', add: 'Bought elsewhere' },
  customer_supplied: { label: 'Customer’s own', add: 'Customer’s own' },
};
const newMaterial = (mode) => ({ key: Math.random().toString(36).slice(2), mode, quantity: 1, rate: '', description: '', cost: '', paid_ledger_id: '', variant_id: null });
const variantLabel = (product, variant) => `${product}${variant && variant !== 'Standard' ? ` — ${variant}` : ''}`;
const materialPayload = (m) => {
  const base = { mode: m.mode, quantity: Number(m.quantity) || 0 };
  if (m.mode === 'charged') return { ...base, variant_id: m.variant_id, variant_unit_id: m.variant_unit_id || undefined, rate: m.rate === '' ? undefined : Number(m.rate) };
  if (m.mode === 'included') return { ...base, variant_id: m.variant_id, variant_unit_id: m.variant_unit_id || undefined };
  if (m.mode === 'bought_outside') return { ...base, description: m.description, cost: Number(m.cost) || 0, rate: Number(m.rate) || 0, paid_ledger_id: m.paid_ledger_id || undefined };
  return { ...base, description: m.description };
};

/** The parts a service used, filed under its line: from stock (charged or included), bought elsewhere, or the customer's own. */
function MaterialsEditor({ api, materials, onChange, ledgers }) {
  const set = (key, patch) => onChange(materials.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  const payFrom = ledgers.filter((l) => ['Sundry Creditors', 'Cash-in-hand', 'Bank Accounts'].includes(l.group?.name));
  return (
    <div style={{ borderTop: `1px dashed ${colors.tint(0.15)}`, marginTop: 8, paddingTop: 8 }}>
      <label style={label}>Materials used</label>
      {materials.length === 0 && <p style={{ margin: '0 0 6px', fontSize: '0.72rem', color: colors.textFaint }}>None. Add what this job uses — from stock, bought elsewhere, or the customer’s own.</p>}
      {materials.map((m) => (
        <div key={m.key} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
          <div style={{ flex: '2 1 200px', minWidth: 160 }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: colors.primary, marginBottom: 2 }}>{MATERIAL_MODES[m.mode].label}</div>
            {(m.mode === 'charged' || m.mode === 'included') && (m.variant_id
              ? <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{m.label}</div>
              : <Picker api={api} kind="product" purpose="purchase" placeholder="Search a product…" onPick={(r) => set(m.key, { variant_id: r.variant_id, label: variantLabel(r.product, r.variant), variant_unit_id: r.units.find((u) => u.role === 'base')?.id ?? r.units[0]?.id, unit_code: r.units.find((u) => u.role === 'base')?.code })} render={(r) => <>{r.product} <span style={{ color: colors.textFaint }}>{r.variant} · {r.sku}</span></>} />)}
            {(m.mode === 'bought_outside' || m.mode === 'customer_supplied') && (
              <input value={m.description} onChange={(e) => set(m.key, { description: e.target.value })} placeholder={m.mode === 'bought_outside' ? 'e.g. Side mirror' : 'e.g. Customer’s bumper'} style={small} />
            )}
          </div>
          <div style={{ width: 84 }}><label style={label}>Qty{m.unit_code ? ` (${m.unit_code})` : ''}</label><input type="number" step="any" min="0" value={m.quantity} onChange={(e) => set(m.key, { quantity: e.target.value })} style={small} /></div>
          {m.mode === 'charged' && <div style={{ width: 120 }}><label style={label}>Price each</label><input type="number" step="0.01" min="0" value={m.rate} placeholder="its price" onChange={(e) => set(m.key, { rate: e.target.value })} style={small} /></div>}
          {m.mode === 'bought_outside' && (
            <>
              <div style={{ width: 120 }}><label style={label}>We paid (total)</label><input type="number" step="0.01" min="0" value={m.cost} onChange={(e) => set(m.key, { cost: e.target.value })} style={small} /></div>
              <div style={{ width: 120 }}><label style={label}>Charge each</label><input type="number" step="0.01" min="0" value={m.rate} placeholder="0 = absorbed" onChange={(e) => set(m.key, { rate: e.target.value })} style={small} /></div>
              <div style={{ width: 170 }}>
                <label style={label}>Paid from / owed to</label>
                <select value={m.paid_ledger_id} onChange={(e) => set(m.key, { paid_ledger_id: e.target.value })} style={small}>
                  <option value="">Choose…</option>
                  {payFrom.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </>
          )}
          <button type="button" aria-label="Remove material" onClick={() => onChange(materials.filter((x) => x.key !== m.key))} style={{ ...btnGhost, padding: '5px 6px', color: colors.danger }}><Trash2 size={13} /></button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.entries(MATERIAL_MODES).map(([mode, d]) => (
          <button key={mode} type="button" onClick={() => onChange([...materials, newMaterial(mode)])} style={{ ...btnGhost, padding: '3px 9px', fontSize: '0.68rem' }}><Plus size={11} /> {d.add}</button>
        ))}
      </div>
    </div>
  );
}

const emptyLine = (type) => ({ key: Math.random().toString(36).slice(2), type, quantity: 1, rate: '', discount: '', description: '', kind: 'shipping', amount: '', ledger_id: '', shipping_option_id: '' });

export default function VoucherForm({ api = booksAPI, mode = 'books' }) {
  const nav = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const canWrite = mode === 'quotation' ? ['finance', 'manager', 'admin', 'super_admin', 'sales_rep'].includes(user?.role) : canWriteFinance(user);
  const home = mode === 'quotation' ? '/admin/quotes' : '/admin/books';
  const viewPath = (vid) => (mode === 'quotation' ? `/admin/quotes/${vid}` : `/admin/books/vouchers/${vid}`);
  const editing = Boolean(id);

  const [types, setTypes] = useState([]);
  const [typeId, setTypeId] = useState(params.get('type') ?? '');
  const [methods, setMethods] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(editing);

  const [h, setH] = useState({ date: today(), location_id: '', party_ledger_id: '', customer: null, payment_method_id: '', reference_no: '', party_name: '', party_phone: '', party_address: '', party_tax_id: '', narration: '', due_date: '', series_id: '', voucher_number: '', amount: '', ledger_id: '', valid_until: '' });
  const [lines, setLines] = useState([]);
  const [entries, setEntries] = useState([{ ledger_id: '', side: 'D', amount: '' }, { ledger_id: '', side: 'C', amount: '' }]);
  const [manual, setManual] = useState(false);
  const [shipOptions, setShipOptions] = useState([]);
  const [tenders, setTenders] = useState([]);
  const [whRates, setWhRates] = useState([]);
  const [wh, setWh] = useState({ tax_rate_id: '', amount: '', certificate_no: '' });
  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const [expiredOverride, setExpiredOverride] = useState({ on: false, reason: '' });

  const type = types.find((t) => String(t.id) === String(typeId));
  const base = type?.base_type;
  const hasItems = Boolean(type?.has_items);
  const isMoney = base === 'receipt' || base === 'payment';
  const isEntries = base === 'journal' || base === 'contra';
  const needsMethod = ['cash_sale', 'receipt', 'payment'].includes(base);

  useEffect(() => {
    api.types().then((t) => setTypes(t.filter((x) => x.is_active))).catch((e) => toast.error(errMsg(e, 'Could not load voucher types')));
    shippingAPI.getActiveOptions().then(setShipOptions).catch(() => {});
    taxAPI.getRates({ active: true }).then((r) => setWhRates((r.tax_rates ?? []).filter((x) => x.tax_type?.application_mode === 'withheld'))).catch(() => {});
    api.paymentMethods().then((m) => setMethods(m.filter((x) => x.is_active))).catch(() => {});
    api.ledgers({ all: 1, active_only: 1 }).then((r) => setLedgers(Array.isArray(r) ? r : r.data ?? [])).catch(() => {});
    locationsAPI.getAdmin().then((r) => {
      const act = (r.locations ?? []).filter((l) => l.is_active !== false);
      setBranches(act);
      setH((x) => (x.location_id ? x : { ...x, location_id: (act.find((l) => l.is_default) ?? act[0])?.id ?? '' }));
    }).catch(() => {});
  }, []);

  // Load an existing voucher for editing
  useEffect(() => {
    if (!editing) return;
    api.voucher(id).then((v) => {
      setTypeId(String(v.voucher_type_id));
      setH((x) => ({ ...x, date: v.date, location_id: v.location_id ?? '', party_ledger_id: v.party_ledger_id ?? '', customer: v.customer_id ? { customer_id: v.customer_id, name: v.party_ledger?.name } : null,
        payment_method_id: v.payment_method_id ?? '', reference_no: v.reference_no ?? '', party_name: v.party_name ?? '', party_phone: v.party_phone ?? '', party_address: v.party_address ?? '', party_tax_id: v.party_tax_id ?? '', narration: v.narration ?? '', due_date: v.due_date ?? '', valid_until: v.valid_until ?? '', series_id: v.series_id ?? '', voucher_number: v.voucher_number, amount: v.total_amount }));
      if (v.type?.has_items) {
        setLines((v.items ?? []).filter((i) => !i.parent_item_id).map((i) => {
          const b = { key: `i${i.id}`, quantity: Number(i.quantity), discount: Number(i.discount_amount) || '', description: i.description, notes: i.notes ?? '' };
          if (i.item_type === 'product') return { ...b, type: 'product', variant_id: i.variant_id, variant_unit_id: i.variant_unit_id, rate: Number(i.rate), label: `${i.description}${i.variant_label ? ` — ${i.variant_label}` : ''}`, units: [] };
          if (i.item_type === 'service') {
            const materials = (v.items ?? []).filter((c) => c.parent_item_id === i.id && c.material_mode).map((c) => ({
              ...newMaterial(c.material_mode), key: `m${c.id}`, variant_id: c.variant_id, variant_unit_id: c.variant_unit_id, unit_code: c.unit_code,
              label: variantLabel(c.description, c.variant_label), quantity: Number(c.quantity), description: c.description,
              rate: ['charged', 'bought_outside'].includes(c.material_mode) ? Number(c.rate) : '', cost: c.cost_amount ?? '', paid_ledger_id: c.paid_ledger_id ?? '',
            }));
            return { ...b, type: 'service', service_id: i.service_id, service_variant_id: i.service_variant_id, rate: Number(i.rate), label: i.description, materials };
          }
          if (i.item_type === 'hamper') return { ...b, type: 'hamper', hamper_id: i.hamper_id, rate: '', label: i.description };
          if (i.item_type === 'charge') return { ...b, type: 'charge', kind: Number(i.amount) < 0 ? 'discount' : 'other', amount: Math.abs(Number(i.amount)), ledger_id: i.ledger_id ?? '' };
          return { ...b, type: 'custom', rate: Number(i.rate), ledger_id: i.ledger_id ?? '' };
        }));
      } else if (v.entries?.length) {
        setEntries(v.entries.map((e) => ({ ledger_id: e.ledger_id, side: e.side, amount: Number(e.amount) })));
      }
    }).catch((e) => toast.error(errMsg(e, 'Could not load the voucher'))).finally(() => setLoading(false));
  }, [id, editing]);

  // numbering options for the chosen type
  useEffect(() => {
    if (!typeId || editing) { setSeries([]); return; }
    api.nextNumbers({ voucher_type_id: typeId, date: h.date, location_id: h.location_id || undefined })
      .then((s) => { setSeries(s); setH((x) => ({ ...x, series_id: s.find((y) => y.location_id && String(y.location_id) === String(x.location_id))?.id ?? s.find((y) => y.is_default)?.id ?? s[0]?.id ?? '' })); })
      .catch(() => setSeries([]));
  }, [typeId, h.date, h.location_id, editing]);

  const payload = useMemo(() => {
    const p = {
      voucher_type_id: Number(typeId), date: h.date, location_id: h.location_id || null, reference_no: h.reference_no || null, narration: h.narration || null,
      party_name: h.party_name || null, party_phone: h.party_phone || null, party_address: h.party_address || null, party_tax_id: h.party_tax_id || null,
      party_ledger_id: h.party_ledger_id || null, customer_id: h.customer?.customer_id ?? null, payment_method_id: h.payment_method_id || null, due_date: h.due_date || null,
      valid_until: h.valid_until || undefined,
    };
    if (hasItems) {
      p.lines = lines.map((l) => {
        const b = { type: l.type, quantity: Number(l.quantity) || 0, discount: Number(l.discount) || 0, notes: l.notes || undefined };
        if (l.type === 'product') return { ...b, variant_id: l.variant_id, variant_unit_id: l.variant_unit_id || undefined, rate: l.rate === '' ? undefined : Number(l.rate), batch_id: l.batch_id || undefined };
        if (l.type === 'service') return { ...b, service_id: l.service_id, service_variant_id: l.service_variant_id, rate: l.rate === '' ? undefined : Number(l.rate), materials: (l.materials ?? []).map(materialPayload) };
        if (l.type === 'hamper') return { type: 'hamper', hamper_id: l.hamper_id, quantity: b.quantity, discount: b.discount };
        if (l.type === 'charge') return l.kind === 'shipping' && l.shipping_option_id
          ? { type: 'charge', kind: 'shipping', shipping_option_id: l.shipping_option_id }
          : { type: 'charge', kind: l.kind, amount: Number(l.amount) || 0, description: l.description || undefined, ledger_id: l.ledger_id || undefined };
        return { ...b, type: 'custom', description: l.description, rate: Number(l.rate) || 0, ledger_id: l.ledger_id || undefined };
      });
    } else if (isMoney) {
      p.amount = Number(h.amount) || 0;
      p.ledger_id = h.ledger_id || undefined;
      if (wh.tax_rate_id) p.withholding = { tax_rate_id: Number(wh.tax_rate_id), amount: wh.amount === '' ? undefined : Number(wh.amount), certificate_no: wh.certificate_no || undefined };
    } else if (isEntries) {
      p.entries = entries.map((e) => ({ ledger_id: e.ledger_id, side: e.side, amount: Number(e.amount) || 0 }));
    }
    if (expiredOverride.on && expiredOverride.reason.trim()) p.expired_override = { reason: expiredOverride.reason.trim() };
    if (tenders.length) p.tenders = tenders.map((t) => ({ payment_method_id: t.payment_method_id, amount: t.amount === '' ? undefined : Number(t.amount), gift_voucher_code: t.code || undefined, reference: t.reference || undefined }));
    if (!editing) {
      if (manual && h.voucher_number) p.voucher_number = h.voucher_number;
      else if (h.series_id) p.series_id = h.series_id;
    }
    return p;
  }, [typeId, h, lines, entries, tenders, wh, hasItems, isMoney, isEntries, manual, editing, expiredOverride]);

  // live preview (business errors show inline, not as toasts)
  useEffect(() => {
    if (!type) return undefined;
    const ready = hasItems ? lines.length > 0 : isMoney ? Number(h.amount) > 0 : entries.length >= 2 && entries.every((e) => e.ledger_id && Number(e.amount) > 0);
    if (!ready) { setPreview(null); setPreviewErr(null); return undefined; }
    const t = setTimeout(() => {
      api.previewVoucher(payload).then((p) => { setPreview(p); setPreviewErr(null); }).catch((e) => { setPreview(null); setPreviewErr(errMsg(e, 'Could not work out this voucher')); });
    }, 500);
    return () => clearTimeout(t);
  }, [payload, type, hasItems, isMoney, entries, lines.length, h.amount]);

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = (t) => setLines((ls) => [...ls, emptyLine(t)]);
  const setEntry = (i, patch) => setEntries((es) => es.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const dr = entries.filter((e) => e.side === 'D').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const cr = entries.filter((e) => e.side === 'C').reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const save = async () => {
    setSaving(true); setSaveErr(null);
    try {
      const res = editing ? await api.updateVoucher(id, payload) : await api.createVoucher(payload);
      toast.success(res.message ?? 'Saved');
      nav(viewPath(res.data.id));
    } catch (e) { const m = errMsg(e, 'Could not save the voucher'); setSaveErr(m); toast.error(m, { duration: 7000 }); }
    finally { setSaving(false); }
  };

  const partyLedgers = ledgers.filter((l) => ['Sundry Debtors', 'Sundry Creditors'].includes(l.group?.name));
  const moneyLedgers = ledgers.filter((l) => ['Cash-in-hand', 'Bank Accounts'].includes(l.group?.name));

  if (!canWrite) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the voucher form" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '28px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <Link to={home} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.78rem', color: colors.textMuted, textDecoration: 'none', marginBottom: 10 }}><ArrowLeft size={14} /> {mode === 'quotation' ? 'Quotations' : 'Books'}</Link>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: colors.primary, margin: '0 0 16px' }}>{editing ? `Edit ${h.voucher_number}` : type ? `New ${type.name}` : 'New voucher'}</h1>
        {loading ? <p style={{ color: colors.textMuted }}>Loading…</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 16 }}>
            <div style={{ ...card, padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
              <div>
                <label style={label}>Voucher type</label>
                <select value={typeId} disabled={editing} onChange={(e) => { setTypeId(e.target.value); setLines([]); setPreview(null); }} style={small}>
                  <option value="">Choose…</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div><label style={label}>Date</label><input type="date" value={h.date} onChange={(e) => setH((x) => ({ ...x, date: e.target.value }))} style={small} /></div>
              <div>
                <label style={label}>Branch</label>
                <select value={h.location_id} onChange={(e) => setH((x) => ({ ...x, location_id: e.target.value }))} style={small}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              {!editing && series.length > 0 && (
                <div>
                  <label style={label}>Numbering</label>
                  {manual
                    ? <input value={h.voucher_number} onChange={(e) => setH((x) => ({ ...x, voucher_number: e.target.value }))} placeholder="Type the number" style={small} />
                    : <select value={h.series_id} onChange={(e) => setH((x) => ({ ...x, series_id: e.target.value }))} style={small}>{series.map((s) => <option key={s.id} value={s.id}>{s.next} · {s.name}</option>)}</select>}
                  {series.some((s) => s.allow_manual) && (
                    <label style={{ fontSize: '0.7rem', color: colors.textMuted, display: 'flex', gap: 4, marginTop: 4 }}><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> Type it myself</label>
                  )}
                </div>
              )}
              {type?.party_kind === 'customer' && hasItems && (
                <div>
                  <label style={label}>Customer {h.customer && <button type="button" onClick={() => setH((x) => ({ ...x, customer: null }))} style={{ border: 'none', background: 'none', color: colors.primary, cursor: 'pointer', fontSize: '0.68rem' }}>clear</button>}</label>
                  {h.customer ? <div style={{ ...small, background: colors.tint(0.05) }}>{h.customer.name}</div>
                    : <Picker api={api} kind="customer" placeholder="Search customers (blank = walk-in)…" onPick={(c) => setH((x) => ({ ...x, customer: c }))} render={(c) => <>{c.name} <span style={{ color: colors.textFaint }}>{c.email}</span></>} />}
                </div>
              )}
              {type?.party_kind === 'customer' && hasItems && !h.customer && (
                <>
                  <div><label style={label}>Sold to (name)</label><input value={h.party_name} onChange={(e) => setH((x) => ({ ...x, party_name: e.target.value }))} style={small} placeholder="Walk-in buyer's name" /></div>
                  <div><label style={label}>Their phone</label><input value={h.party_phone} onChange={(e) => setH((x) => ({ ...x, party_phone: e.target.value }))} style={small} /></div>
                  <div><label style={label}>Their address</label><input value={h.party_address} onChange={(e) => setH((x) => ({ ...x, party_address: e.target.value }))} style={small} /></div>
                  <div><label style={label}>Their PIN / tax ID</label><input value={h.party_tax_id} onChange={(e) => setH((x) => ({ ...x, party_tax_id: e.target.value }))} style={small} /></div>
                </>
              )}
              {(type?.party_kind === 'supplier' || isMoney) && (
                <div>
                  <label style={label}>{isMoney ? 'Party' : 'Supplier'}</label>
                  <select value={h.party_ledger_id} onChange={(e) => setH((x) => ({ ...x, party_ledger_id: e.target.value }))} style={small}>
                    <option value="">Choose a ledger…</option>
                    {(type?.party_kind === 'supplier' ? partyLedgers.filter((l) => l.group?.name === 'Sundry Creditors') : ledgers).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              {needsMethod && (
                <div>
                  <label style={label}>Payment method</label>
                  <select value={h.payment_method_id} onChange={(e) => setH((x) => ({ ...x, payment_method_id: e.target.value }))} style={small}>
                    <option value="">Choose…</option>
                    {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}
              {isMoney && !h.payment_method_id && (
                <div>
                  <label style={label}>…or cash / bank ledger</label>
                  <select value={h.ledger_id} onChange={(e) => setH((x) => ({ ...x, ledger_id: e.target.value }))} style={small}>
                    <option value="">Choose…</option>{moneyLedgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              {needsMethod && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <button type="button" onClick={() => setTenders((t) => (t.length ? [] : [{ payment_method_id: h.payment_method_id || '', amount: '', code: '', reference: '' }, { payment_method_id: '', amount: '', code: '', reference: '' }]))}
                    style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' }}>{tenders.length ? 'Pay one way' : 'Split payment (e.g. gift voucher + M-Pesa)'}</button>
                  {tenders.map((t, i) => {
                    const m = methods.find((x) => String(x.id) === String(t.payment_method_id));
                    const set = (k, v) => setTenders((ts) => ts.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1fr) 110px minmax(120px,1fr) auto', gap: 8, marginTop: 8, alignItems: 'end' }}>
                        <select value={t.payment_method_id} onChange={(e) => set('payment_method_id', e.target.value)} style={small}><option value="">Method…</option>{methods.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                        <input type="number" step="0.01" min="0" placeholder={i === tenders.length - 1 ? 'the rest' : 'amount'} value={t.amount} onChange={(e) => set('amount', e.target.value)} style={small} />
                        {m?.kind === 'gift_voucher'
                          ? <input placeholder="Gift voucher code" value={t.code} onChange={(e) => set('code', e.target.value)} style={small} />
                          : <input placeholder="Reference" value={t.reference} onChange={(e) => set('reference', e.target.value)} style={small} />}
                        <button type="button" aria-label="Remove" onClick={() => setTenders((ts) => ts.filter((_, j) => j !== i))} style={{ ...btnGhost, padding: '6px 8px' }}><Trash2 size={14} /></button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div><label style={label}>Reference</label><input value={h.reference_no} onChange={(e) => setH((x) => ({ ...x, reference_no: e.target.value }))} style={small} placeholder="PO no., M-Pesa code…" /></div>
              {base === 'quotation' && <div><label style={label}>Valid until</label><input type="date" value={h.valid_until} onChange={(e) => setH((x) => ({ ...x, valid_until: e.target.value }))} style={small} /></div>}
              {['sales', 'purchase'].includes(base) && <div><label style={label}>Due date</label><input type="date" value={h.due_date} onChange={(e) => setH((x) => ({ ...x, due_date: e.target.value }))} style={small} /></div>}
            </div>

            {type && hasItems && (
              <div style={{ ...card, padding: 18 }}>
                <p style={{ margin: '0 0 10px', fontWeight: 700, color: colors.text }}>Items</p>
                {lines.length === 0 && <p style={{ color: colors.textMuted, fontSize: '0.8rem' }}>Nothing added yet.</p>}
                {lines.map((l) => (
                  <div key={l.key} style={{ padding: '10px 0', borderTop: `1px solid ${colors.tint(0.06)}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,2fr) repeat(auto-fit,minmax(84px,1fr)) auto', gap: 8, alignItems: 'end' }}>
                    <div>
                      <label style={label}>{{ product: 'Product / variant', service: 'Service / package', hamper: 'Hamper', charge: 'Charge', custom: 'Custom line' }[l.type]}</label>
                      {l.type === 'product' && (l.variant_id
                        ? <div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{l.label}</div>
                          {SALES_SIDE.includes(base) && !['quotation', 'credit_note'].includes(base) && l.track_expiry && (
                            <BatchPick api={api} variantId={l.variant_id} locationId={h.location_id} value={l.batch_id} onChange={(v) => setLine(l.key, { batch_id: v })} />
                          )}
                        </div>
                        : <Picker api={api} kind="product" purpose={SALES_SIDE.includes(base) ? 'sale' : 'purchase'} placeholder="Search products…" onPick={(r) => setLine(l.key, { variant_id: r.variant_id, track_expiry: Boolean(r.track_expiry), batch_id: '', label: `${r.product}${r.variant && r.variant !== 'Standard' ? ` — ${r.variant}` : ''}`, units: r.units, variant_unit_id: (r.units.find((u) => u.is_default_sale) ?? r.units.find((u) => u.role === 'base'))?.id, rate: '' })} render={(r) => <>{r.product} <span style={{ color: colors.textFaint }}>{r.variant} · {r.sku}</span></>} />)}
                      {l.type === 'service' && (l.service_variant_id
                        ? <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{l.label}</div>
                        : <Picker api={api} kind="service" placeholder="Search services…" onPick={(r) => setLine(l.key, { service_id: r.service_id, service_variant_id: r.service_variant_id, label: `${r.service} — ${r.package}`, rate: '', materials: (r.materials ?? []).map((m) => ({ ...newMaterial(m.mode), variant_id: m.variant_id, variant_unit_id: m.variant_unit_id, unit_code: m.unit_code, label: variantLabel(m.product, m.variant), quantity: m.quantity })) })} render={(r) => <>{r.service} <span style={{ color: colors.textFaint }}>{r.package}</span></>} />)}
                      {l.type === 'hamper' && (l.hamper_id
                        ? <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{l.label}</div>
                        : <Picker api={api} kind="hamper" placeholder="Search hampers…" onPick={(r) => setLine(l.key, { hamper_id: r.hamper_id, label: r.name })} render={(r) => <>{r.name} <span style={{ color: colors.textFaint }}>{money(r.price)}</span></>} />)}
                      {l.type === 'charge' && (
                        <select value={l.kind} onChange={(e) => setLine(l.key, { kind: e.target.value })} style={small}>
                          <option value="shipping">Shipping / delivery</option><option value="discount">Discount</option><option value="rounding">Rounding</option><option value="other">Other charge</option>
                        </select>
                      )}
                      {l.type === 'custom' && <input value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder="Description" style={small} />}
                    </div>
                    {l.type === 'charge' && l.kind === 'shipping' ? (
                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={label}>Delivery method</label>
                        <select value={l.shipping_option_id} onChange={(e) => setLine(l.key, { shipping_option_id: e.target.value ? Number(e.target.value) : '' })} style={small}>
                          <option value="">Choose…</option>
                          {shipOptions.map((o) => <option key={o.id} value={o.id}>{o.name} — {o.currency?.code} {money(o.cost)}</option>)}
                        </select>
                      </div>
                    ) : l.type === 'charge' ? (
                      <>
                        <div><label style={label}>Amount</label><input type="number" step="0.01" min="0" value={l.amount} onChange={(e) => setLine(l.key, { amount: e.target.value })} style={small} /></div>
                        <div><label style={label}>Ledger{l.kind === 'other' ? '' : ' (auto)'}</label>
                          <select value={l.ledger_id} onChange={(e) => setLine(l.key, { ledger_id: e.target.value })} style={small}><option value="">Default</option>{ledgers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
                      </>
                    ) : (
                      <>
                        <div><label style={label}>Qty</label><input type="number" step="any" min="0" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} style={small} /></div>
                        {l.type === 'product' && (l.units?.length > 1) && (
                          <div><label style={label}>Unit</label>
                            <select value={l.variant_unit_id ?? ''} onChange={(e) => setLine(l.key, { variant_unit_id: Number(e.target.value), rate: '' })} style={small}>
                              {l.units.filter((u) => u.sellable || u.role === 'base').map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
                            </select></div>
                        )}
                        {l.type !== 'hamper' && (
                          <div><label style={label}>Rate</label>
                            <input type="number" step="0.01" min="0" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} style={small}
                              placeholder={ ['quotation', 'sales_order', 'delivery_note', 'sales', 'cash_sale', 'credit_note'].includes(base) && l.type !== 'custom' ? 'catalogue' : '0.00'} /></div>
                        )}
                        {l.type === 'custom' && (
                          <div><label style={label}>Ledger</label>
                            <select value={l.ledger_id} onChange={(e) => setLine(l.key, { ledger_id: e.target.value })} style={small}><option value="">Choose…</option>{ledgers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
                        )}
                        <div><label style={label}>Discount</label><input type="number" step="0.01" min="0" value={l.discount} onChange={(e) => setLine(l.key, { discount: e.target.value })} style={small} /></div>
                      </>
                    )}
                    <button type="button" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} style={{ ...btnGhost, padding: '6px 8px', color: colors.danger }}><Trash2 size={14} /></button>
                  </div>
                    {l.type === 'service' && l.service_variant_id && (
                      <MaterialsEditor api={api} materials={l.materials ?? []} ledgers={ledgers} onChange={(m) => setLine(l.key, { materials: m })} />
                    )}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {[['product', 'Product'], ['service', 'Service'], ['hamper', 'Hamper'], ['charge', 'Charge / discount'], ['custom', 'Custom line']].map(([t, l]) => (
                    <button key={t} type="button" onClick={() => addLine(t)} style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.75rem' }}><Plus size={12} /> {l}</button>
                  ))}
                </div>
              </div>
            )}

            {type && isMoney && (
              <div style={{ ...card, padding: 18, maxWidth: 360 }}>
                <label style={label}>Amount</label>
                <input type="number" step="0.01" min="0" value={h.amount} onChange={(e) => setH((x) => ({ ...x, amount: e.target.value }))} style={small} />
                {whRates.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.tint(0.08)}` }}>
                    <label style={label}>{base === 'receipt' ? 'Tax the customer withheld' : 'Tax we withheld'}</label>
                    <select value={wh.tax_rate_id} onChange={(e) => setWh((x) => ({ ...x, tax_rate_id: e.target.value }))} style={small}>
                      <option value="">None</option>
                      {whRates.map((r) => <option key={r.id} value={r.id}>{r.tax_type?.name} {Number(r.rate_value)}{r.rate_type === 'percentage' ? '%' : ''}{r.classification ? ` — ${r.classification}` : ''}</option>)}
                    </select>
                    {wh.tax_rate_id && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                        <input type="number" step="0.01" min="0" placeholder="Amount (blank = by rate)" value={wh.amount} onChange={(e) => setWh((x) => ({ ...x, amount: e.target.value }))} style={small} />
                        <input placeholder="Certificate no." value={wh.certificate_no} onChange={(e) => setWh((x) => ({ ...x, certificate_no: e.target.value }))} style={small} />
                      </div>
                    )}
                    <p style={{ fontSize: '0.7rem', color: colors.textMuted, margin: '6px 0 0' }}>The amount above is the gross. {base === 'receipt' ? 'Cash received is the gross less the tax withheld; the withheld tax becomes a credit we hold.' : 'Cash paid is the gross less the tax we withheld and will remit.'}</p>
                  </div>
                )}
                <p style={{ fontSize: '0.72rem', color: colors.textMuted, marginBottom: 0 }}>Recorded on account (advance). To settle a specific invoice, open it and use “Receive payment”.</p>
              </div>
            )}

            {type && isEntries && (
              <div style={{ ...card, padding: 18 }}>
                <p style={{ margin: '0 0 10px', fontWeight: 700, color: colors.text }}>Entries</p>
                {entries.map((e, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px minmax(200px,1fr) 140px auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <select value={e.side} onChange={(ev) => setEntry(i, { side: ev.target.value })} style={small}><option value="D">Dr</option><option value="C">Cr</option></select>
                    <select value={e.ledger_id} onChange={(ev) => setEntry(i, { ledger_id: ev.target.value })} style={small}>
                      <option value="">Choose a ledger…</option>
                      {(base === 'contra' ? moneyLedgers : ledgers).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <input type="number" step="0.01" min="0" value={e.amount} onChange={(ev) => setEntry(i, { amount: ev.target.value })} style={small} placeholder="Amount" />
                    <button type="button" aria-label="Remove entry" onClick={() => setEntries((es) => es.filter((_, j) => j !== i))} disabled={entries.length <= 2} style={{ ...btnGhost, padding: '6px 8px' }}><Trash2 size={14} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setEntries((es) => [...es, { ledger_id: '', side: 'D', amount: '' }])} style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.75rem' }}><Plus size={12} /> Entry</button>
                <p style={{ fontSize: '0.8rem', marginBottom: 0, color: Math.abs(dr - cr) < 0.005 ? colors.successText : colors.dangerText }}>Debit {money(dr)} · Credit {money(cr)}{Math.abs(dr - cr) >= 0.005 && ` · difference ${money(Math.abs(dr - cr))}`}</p>
              </div>
            )}

            {type && (
              <div style={{ ...card, padding: 18 }}>
                <label style={label}>Narration</label>
                <textarea value={h.narration} onChange={(e) => setH((x) => ({ ...x, narration: e.target.value }))} rows={2} style={{ ...small, width: '100%' }} />
              </div>
            )}

            {hasItems && SALES_SIDE.includes(base) && !['quotation', 'credit_note'].includes(base) && lines.some((l) => l.track_expiry) && (
              <div style={{ ...card, padding: 14 }}>
                <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                  <input type="checkbox" checked={expiredOverride.on} onChange={(e) => setExpiredOverride((x) => ({ ...x, on: e.target.checked }))} /> Sell expired stock (override)
                </label>
                {expiredOverride.on && (
                  <div style={{ marginTop: 8 }}>
                    <input value={expiredOverride.reason} onChange={(e) => setExpiredOverride((x) => ({ ...x, reason: e.target.value }))} placeholder="Why? (required — it is logged on the voucher)" style={small} />
                    <p style={{ margin: '6px 0 0', fontSize: '0.7rem', color: colors.textFaint }}>Only works where Settings → Stock &amp; expiry allows overrides for the product, and for the roles named there.</p>
                  </div>
                )}
              </div>
            )}
            {(preview || previewErr) && (
              <div style={{ ...card, padding: 18 }}>
                <p style={{ margin: '0 0 10px', fontWeight: 700, color: colors.text }}>What this will post</p>
                {previewErr && <p role="alert" style={{ margin: 0, color: colors.dangerText, fontSize: '0.82rem' }}>{previewErr}</p>}
                {preview?.warnings?.length > 0 && (
                  <div role="status" style={{ margin: '0 0 10px', padding: '8px 10px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.8rem' }}>
                    {preview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                  </div>
                )}
                {preview && (
                  <>
                    {preview.lines?.length > 0 && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', marginBottom: 12 }}>
                        <tbody>
                          {preview.lines.flatMap((l) => [l, ...(l.children ?? []).map((c) => ({ ...c, is_child: true }))]).map((l, i) => (
                            <tr key={i} style={{ borderTop: `1px solid ${colors.tint(0.05)}`, color: l.is_child ? colors.textMuted : colors.text, fontWeight: l.is_header ? 700 : 400 }}>
                              <td style={{ padding: '5px 4px', paddingLeft: l.is_child ? 22 : 4 }}>{l.description}{l.variant_label ? ` — ${l.variant_label}` : ''}</td>
                              <td style={{ textAlign: 'right' }}>{l.quantity} {l.unit_code}</td>
                              <td style={{ textAlign: 'right' }}>{money(l.amount)}</td>
                              <td style={{ textAlign: 'right', color: colors.textFaint }}>{l.tax_amount ? `tax ${money(l.tax_amount)}` : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                      <tbody>
                        {preview.entries.map((e, i) => (
                          <tr key={i} style={{ borderTop: `1px solid ${colors.tint(0.05)}` }}>
                            <td style={{ padding: '5px 4px', width: 40, color: colors.textFaint }}>{e.side === 'D' ? 'Dr' : 'Cr'}</td>
                            <td>{e.ledger}</td>
                            <td style={{ textAlign: 'right' }}>{money(e.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p style={{ textAlign: 'right', margin: '10px 0 0', fontSize: '0.85rem' }}>
                      Subtotal {money(preview.subtotal)} · Tax {money(preview.tax_total)} · <strong>Total {preview.currency} {money(preview.total)}</strong>
                    </p>
                    {preview.stock?.length > 0 && <p style={{ textAlign: 'right', margin: '4px 0 0', fontSize: '0.72rem', color: colors.textMuted }}>Moves stock on {preview.stock.length} line(s).</p>}
                  </>
                )}
              </div>
            )}

            {saveErr && <p role="alert" style={{ margin: 0, padding: '10px 14px', borderRadius: 8, background: colors.dangerBg, color: colors.dangerText, fontSize: '0.85rem' }}>{saveErr}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" style={btnGhost} onClick={() => nav(-1)}>Cancel</button>
              <button type="button" style={{ ...btnPrimary, opacity: saving || !type ? 0.6 : 1 }} disabled={saving || !type} onClick={save}>{saving ? 'Saving…' : mode === 'quotation' ? 'Save prices' : editing ? 'Save changes' : 'Post voucher'}</button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
