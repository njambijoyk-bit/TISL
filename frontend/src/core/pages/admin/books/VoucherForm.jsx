import { notForPurchaseLines } from '../../../components/admin/books/ledgerPicks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import { NoAccess } from '../../../components/admin/ui/HubHeader';
import OpenBillsPanel from '../../../components/admin/books/OpenBillsPanel';
import InvoiceFinder from '../../../components/admin/books/InvoiceFinder';
import { creditSentence } from '../../../components/admin/books/creditText';
import booksAPI from '../../../../_shared/api/books';
import locationsAPI from '../../../../_shared/api/locations';
import useAuthStore from '../../../../_shared/store/authStore';
import useModuleStore from '../../../../_shared/store/moduleStore';
import { isModuleActive, MODULES } from '../../../../_shared/navigation/modules';
import { canWriteFinance, hasAnyRole, limitBranches } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors, input } from '../../../../_shared/theme/tokens';
import shippingAPI from '../../../../_shared/api/shipping';
import taxAPI from '../../../../_shared/api/tax';
import currencyAPI from '../../../../_shared/api/currency';
import { money, today } from '../../../components/admin/books/booksFmt';
import noSlash from '../../../../_shared/lib/noSlash';

// Sales-side voucher bases sell to customers; the rest buy or adjust, so they may pick "not for sale" materials.
const SALES_SIDE = ['quotation', 'sales_order', 'delivery_note', 'sales', 'cash_sale', 'credit_note'];

const small = { ...input, padding: '6px 8px', fontSize: '0.8rem' };
const label = { display: 'block', fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, marginBottom: 3 };

/** Search-as-you-type picker over /admin/books/lookup. */
const BADGE = { ok: ['#065f46', '#d1fae5'], warn: ['#92400e', '#fef3c7'], bad: ['#991b1b', '#fee2e2'], info: ['#4b5563', '#f3f4f6'] };
function Badges({ list }) {
  if (!list?.length) return null;
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, marginLeft: 6, verticalAlign: 'middle' }}>
      {list.map((b, i) => <span key={i} style={{ padding: '1px 7px', borderRadius: 999, fontSize: '0.62rem', fontWeight: 700, color: BADGE[b.tone]?.[0], background: BADGE[b.tone]?.[1] }}>{b.label}</span>)}
    </span>
  );
}

/** A hamper already on the voucher, with its badges for the customer now on the voucher (they change when the customer does). */
function HamperLineBadges({ api, hamperId, name, customerId }) {
  const [list, setList] = useState([]);
  useEffect(() => {
    let live = true;
    api.lookup('hamper', name, undefined, customerId ? { customer_id: customerId } : {}).then((rows) => { if (live) setList((rows.find((r) => r.hamper_id === hamperId) ?? {}).badges ?? []); }).catch(() => {});
    return () => { live = false; };
  }, [api, hamperId, name, customerId]);
  return <Badges list={list} />;
}

function Picker({ api, kind, purpose, extra, placeholder, onPick, render }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => { api.lookup(kind, q, purpose, extra).then(setRows).catch(() => setRows([])); }, 200);
    return () => clearTimeout(t);
  }, [api, q, open, kind, purpose, extra]);
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

// Tally-style line grid: one header row, one row per line — Name of item | Quantity | per | Rate | Disc | Amount
const LINE_COLS = 'minmax(220px,1fr) 88px 72px 104px 84px 116px 34px';
// a box the admin must not forget: red until it is filled
const NEEDS = { border: '1.5px solid #dc2626', background: '#fef2f2', boxShadow: '0 0 0 3px rgba(220,38,38,0.10)', borderRadius: 10 };
const CLEAR_BTN = { border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 800, padding: '1px 8px', borderRadius: 999, marginLeft: 6 };
const CHANGE_LINK = { border: 'none', background: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 700, padding: 0, marginTop: 4, textDecoration: 'underline' };
const colHead = { fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };

const emptyLine = (type) => ({ key: Math.random().toString(36).slice(2), type, quantity: 1, rate: '', discount: '', description: '', kind: 'shipping', amount: '', ledger_id: '', shipping_option_id: '' });

export default function VoucherForm({ api = booksAPI, mode = 'books' }) {
  const nav = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const canWrite = mode === 'quotation' ? hasAnyRole(user, ['finance', 'manager', 'admin', 'super_admin', 'sales_rep']) : canWriteFinance(user);
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

  const [h, setH] = useState({ date: today(), location_id: '', party_ledger_id: '', customer: null, payment_method_id: '', reference_no: '', party_name: '', party_phone: '', party_address: '', party_tax_id: '', narration: '', due_date: '', paid_ledger_id: '', currency_id: '', series_id: '', voucher_number: '', amount: '', ledger_id: '', valid_until: '' });
  const [lines, setLines] = useState([]);
  const [entries, setEntries] = useState([{ ledger_id: '', side: 'D', amount: '' }, { ledger_id: '', side: 'C', amount: '' }]);
  const [manual, setManual] = useState(false);
  const [shipOptions, setShipOptions] = useState([]);
  const [tenders, setTenders] = useState([]);
  const [rounding, setRounding] = useState('none');   // none | whole | half — Sales and Cash Sales
  const [roundingDefaults, setRoundingDefaults] = useState({});
  const [discountPick, setDiscountPick] = useState(null);   // discount keys ticked (null = not chosen yet: the automatic ones are ticked once they load)
  const [ent, setEnt] = useState(null);               // { gift_vouchers, promo_codes } for the chosen customer
  const [giftPick, setGiftPick] = useState(null);     // gift voucher codes ticked (null = not chosen yet: all usable ones are ticked)
  const [whRates, setWhRates] = useState([]);
  const [wh, setWh] = useState({ tax_rate_id: '', amount: '', certificate_no: '' });
  const [alloc, setAlloc] = useState({});            // receipt / payment: bill id -> amount settled
  const [allocTouched, setAllocTouched] = useState(false);
  const [ins, setIns] = useState({ type: '', number: '', date: '', bank_name: '' });   // receipt / payment through a bank: transfer or cheque
  const [slip, setSlip] = useState({ number: '', date: '', by: '' });                  // contra between cash and bank: deposit / withdrawal slip
  const [isAdvance, setIsAdvance] = useState(false);   // receipt: paid on purpose for something not yet supplied
  const [advanceFor, setAdvanceFor] = useState('');
  const [refund, setRefund] = useState(null);           // payment: { id, number, amount } when giving an overpayment back
  const [custCredits, setCustCredits] = useState([]);   // overpayments / advances the chosen customer holds
  const [creditPick, setCreditPick] = useState(null);   // ids ticked (null = all, ticked from the start)
  const [allParties, setAllParties] = useState(false);   // receipt / payment: customers and suppliers only, unless asked for every ledger
  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState(null);
  // The last price the server worked out. Kept so a failed preview does not make gift vouchers un-tick themselves and trigger another preview (a loop).
  const lastTotal = useRef(0);
  if (preview?.total != null) lastTotal.current = Number(preview.total) || 0;
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const [expiredOverride, setExpiredOverride] = useState({ on: false, reason: '' });

  const type = types.find((t) => String(t.id) === String(typeId));
  const base = type?.base_type;
  // goods are received into branches that take purchases; delivery notes are made from branches that fulfil orders
  const branchAllowed = (kind, b) => (kind === 'receipt_note' || kind === 'purchase' ? b.receives_purchases !== false : kind === 'delivery_note' ? b.fulfils_orders !== false : true);
  const hasItems = Boolean(type?.has_items);
  const isMoney = base === 'receipt' || base === 'payment';
  const isEntries = base === 'journal' || base === 'contra';
  const [legacyDiscounts, setLegacyDiscounts] = useState(null);   // an older voucher's discounts, matched to the ticks once they are known
  const [currencies, setCurrencies] = useState([]);              // for the currency choice when an old voucher's currency is not the base any more
  const [cashPurchase, setCashPurchase] = useState(false);   // a purchase paid at once: cash or bank instead of the supplier
  const needsMethod = ['cash_sale', 'receipt', 'payment'].includes(base);

  // purchases, goods received notes and opening stock are entered on the Purchases page (batches, expiry, create-a-product)
  useEffect(() => {
    if (mode !== 'books' || !base) return;
    const to = { purchase: editing ? `/admin/purchases/${id}/edit` : '/admin/purchases/new', receipt_note: editing ? `/admin/purchases/${id}/edit` : '/admin/purchases/receipt/new', opening_stock: editing ? `/admin/purchases/${id}/edit` : '/admin/stock/opening/new' }[base];
    if (to) nav(to, { replace: true });
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editing) currencyAPI.getCurrencies().then((r) => setCurrencies(Array.isArray(r) ? r : r.currencies ?? r.data ?? [])).catch(() => {});
    api.types().then((t) => setTypes(t.filter((x) => x.is_active))).catch((e) => toast.error(errMsg(e, 'Could not load voucher types')));
    shippingAPI.getActiveOptions().then(setShipOptions).catch(() => {});
    taxAPI.getRates({ active: true }).then((r) => setWhRates((r.tax_rates ?? []).filter((x) => x.tax_type?.application_mode === 'withheld'))).catch(() => {});
    api.paymentMethods().then((m) => setMethods(m.filter((x) => x.is_active))).catch(() => {});
    api.settings().then((d) => setRoundingDefaults({ sales: d.settings?.sales_rounding ?? 'none', cash_sale: d.settings?.cash_sale_rounding ?? 'none' })).catch(() => {});
    api.ledgers({ all: 1, active_only: 1 }).then((r) => setLedgers(Array.isArray(r) ? r : r.data ?? [])).catch(() => {});
    locationsAPI.getAdmin().then((r) => {
      const act = (r.locations ?? []).filter((l) => l.is_active !== false);
      setBranches(act);
      // a new voucher starts at the person's own branch when they have one, else the main branch
      const mine = limitBranches(act, 'books');
      const own = act.find((l) => String(l.id) === String(useAuthStore.getState().access?.scope?.default_location_id));
      setH((x) => (x.location_id ? x : { ...x, location_id: (own ?? mine.find((l) => l.is_default) ?? mine[0] ?? act[0])?.id ?? '' }));
    }).catch(() => {});
  }, []);

  // Load an existing voucher for editing
  useEffect(() => {
    if (!editing) return;
    api.voucher(id).then((v) => {
      setTypeId(String(v.voucher_type_id));
      if (v.meta?.refund_of && (v.allocations ?? []).length) { setRefund({ id: v.allocations[0].against_voucher_id, number: v.meta.refund_of, amount: Number(v.total_amount) }); setAlloc({}); setAllocTouched(true); }
      else if ((v.allocations ?? []).length) { setAlloc(Object.fromEntries(v.allocations.map((a) => [a.against_voucher_id, a.amount]))); setAllocTouched(true); }
      if (v.instrument) { if (['deposit_slip', 'withdrawal'].includes(v.instrument.type)) setSlip({ number: v.instrument.number ?? '', date: v.instrument.date ?? '', by: v.instrument.deposited_by ?? '' }); else setIns({ type: v.instrument.type, number: v.instrument.number ?? '', date: v.instrument.date ?? '', bank_name: v.instrument.bank_name ?? '' }); }
      if (v.meta?.advance) { setIsAdvance(true); setAdvanceFor(v.meta.advance.for ?? ''); }
      setRounding(v.meta?.rounding ?? 'none');   // the rounding line is worked out again on save
      if (v.meta?.gift_codes) setGiftPick(v.meta.gift_codes);
      // the discounts the voucher was saved with come back ticked, and each line goes back to its own (manual) discount — the share the
      // customer's discounts took is put back by the ticks, so nothing is taken twice
      const savedChoices = v.meta?.discount_choices;
      const legacy = !Array.isArray(savedChoices) && (v.meta?.discounts ?? []).length ? v.meta.discounts : null;   // saved before the ticks were remembered
      const SHARE_SRC = ['tier', 'customer_type', 'promo', 'referral', 'personal'];
      setDiscountPick(Array.isArray(savedChoices) ? savedChoices : []);
      setLegacyDiscounts(legacy);
      setH((x) => ({ ...x, ledger_id: ['receipt', 'payment'].includes(v.type?.base_type) && (v.tenders ?? []).length <= 1 ? ((v.entries ?? []).find((e) => !e.is_party && !e.is_tax)?.ledger_id ?? x.ledger_id) : x.ledger_id, date: v.date, location_id: v.location_id ?? '', party_ledger_id: v.party_ledger_id ?? '', customer: v.customer_id ? { customer_id: v.customer_id, name: v.party_ledger?.name } : null,
        payment_method_id: ['receipt', 'payment'].includes(v.type?.base_type) && (v.tenders ?? []).length <= 1 && v.payment_method?.ledger_id ? '' : (v.payment_method_id ?? ''), currency_id: (origCurrency.current = v.currency_id ?? null) ?? '', reference_no: v.reference_no ?? '', party_name: v.party_name ?? '', party_phone: v.party_phone ?? '', party_address: v.party_address ?? '', party_tax_id: v.party_tax_id ?? '', narration: v.narration ?? '', due_date: v.due_date ?? '', valid_until: v.valid_until ?? '', series_id: v.series_id ?? '', voucher_number: v.voucher_number, amount: v.total_amount }));
      if (v.type?.base_type === 'purchase') {
        const paidEntry = (v.entries ?? []).find((e) => e.is_party);
        if (paidEntry && Number(paidEntry.ledger_id) !== Number(v.party_ledger_id ?? 0)) { setCashPurchase(true); setH((x) => ({ ...x, paid_ledger_id: paidEntry.ledger_id })); }
      }
      if ((v.tenders ?? []).length > 1) setTenders(v.tenders.map((t) => ({ payment_method_id: t.payment_method_id, amount: t.amount, code: t.code ?? '', reference: t.reference ?? '' })));
      if (v.type?.has_items) {
        setLines((v.items ?? []).filter((i) => !i.parent_item_id && i.notes !== '__rounding').map((i, idx) => {
          const shared = v.meta?.discount_shares ? Number(v.meta.discount_shares[idx] ?? 0) : (legacy && SHARE_SRC.includes(i.discount_source) ? Number(i.discount_amount) : 0);
          const b = { key: `i${i.id}`, quantity: Number(i.quantity), discount: Math.max(0, Number(i.discount_amount) - shared) || '', description: i.description, notes: i.notes ?? '' };
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
          if (i.item_type === 'charge' && i.shipping_option_id) return { ...b, type: 'charge', kind: 'shipping', shipping_option_id: i.shipping_option_id, waive: Number(i.amount) === 0 };   // re-priced and re-taxed from the shipping option
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

  // a new Sales / Cash Sale starts with the rounding chosen in Settings (off unless you switched it on)
  useEffect(() => {
    if (!editing && (base === 'sales' || base === 'cash_sale')) setRounding(roundingDefaults[base] ?? 'none');
  }, [base, editing, roundingDefaults]);

  // Gift vouchers ticked for this sale, and what each would cover of the total (in the order they were issued).
  const giftPlan = useMemo(() => {
    if (!ent?.gift_vouchers?.length) return [];
    let left = lastTotal.current;
    const out = [];
    ent.gift_vouchers.filter((g) => (giftPick ?? []).includes(g.code)).forEach((g) => {
      const applied = Math.round(Math.min(g.balance, Math.max(left, 0)) * 100) / 100;
      if (applied > 0) { out.push({ code: g.code, applied }); left -= applied; }
    });
    return out;
  }, [ent, giftPick, preview?.total]);   // lastTotal is a ref: it follows preview.total

  // The customer's automatic discounts (personal / tier / type, referral) are ticked for the admin once they load; promo codes are not.
  const discountOptions = preview?.discount_options ?? [];
  // an older voucher did not remember which boxes were ticked: match each discount it took to the closest box
  useEffect(() => {
    if (!editing || !legacyDiscounts || !discountOptions.length) return;
    const picks = [];
    legacyDiscounts.forEach((d) => {
      const cands = discountOptions.filter((o) => !picks.includes(o.key) && (d.source === 'promo' ? o.kind === 'promo' && o.ref === d.ref : d.source === 'customer_type' ? ['personal', 'customer_type'].includes(o.kind) : o.kind === d.source));
      const best = [...cands].sort((x, y) => Math.abs(x.amount - d.amount) - Math.abs(y.amount - d.amount))[0];
      if (best) picks.push(best.key);
    });
    setDiscountPick(picks);
    setLegacyDiscounts(null);
  }, [legacyDiscounts, discountOptions, editing]);
  useEffect(() => {
    if (!editing && h.customer && discountPick === null && discountOptions.length) setDiscountPick(discountOptions.filter((o) => o.auto).map((o) => o.key));
  }, [discountOptions, discountPick, editing, h.customer]);

  // What the chosen customer can use on this sale: their gift vouchers and promo codes, with the amounts they would cover.
  const custId = h.customer?.customer_id;
  const hamperExtra = useMemo(() => (h.customer?.customer_id ? { customer_id: h.customer.customer_id } : {}), [h.customer?.customer_id]);
  // what the chosen customer has paid over or in advance (offered on a Sales invoice or order)
  useEffect(() => {
    const cid = h.customer?.customer_id;
    setCreditPick(null);
    if (!cid || editing || !['sales', 'sales_order'].includes(base)) { setCustCredits([]); return; }
    api.customerCredits(cid).then((d) => setCustCredits(d.credits ?? [])).catch(() => setCustCredits([]));
  }, [h.customer?.customer_id, base, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // giving an overpayment back: the Payment is prefilled from the receipt it refunds
  const refundId = params.get('refund');
  useEffect(() => {
    if (!refundId || editing || base !== 'payment') return;
    api.voucher(refundId).then(async (r) => {
      const d = await api.openBills(r.party_ledger_id);
      const c = (d.credits ?? []).find((x) => String(x.voucher_id) === String(refundId));
      if (!c) { toast.error('Nothing is left to refund on that voucher.'); return; }
      setRefund({ id: Number(refundId), number: r.voucher_number, amount: c.amount });
      setH((x) => ({ ...x, party_ledger_id: r.party_ledger_id, customer: null, amount: c.amount }));
      setAlloc({}); setAllocTouched(true);
    }).catch((e) => toast.error(errMsg(e, 'Could not load the receipt to refund')));
  }, [refundId, base, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // the refund's narration is written for them and follows the account chosen; typing their own stops it
  const autoNarration = useRef('');
  const origCurrency = useRef(null);   // the currency the voucher was made in
  useEffect(() => {
    if (!refund) return;
    const m = methods.find((x) => String(x.id) === String(h.payment_method_id));
    const acct = m?.ledger?.name ?? m?.name ?? ledgers.find((l) => String(l.id) === String(h.ledger_id))?.name;
    const text = `Refund for voucher ${refund.number} for amount ${money(h.amount || refund.amount)}${acct ? ` from ${acct} account` : ''}`;
    setH((x) => (x.narration === '' || x.narration === autoNarration.current ? { ...x, narration: text } : x));
    autoNarration.current = text;
  }, [refund, h.amount, h.payment_method_id, h.ledger_id, methods, ledgers]); // eslint-disable-line react-hooks/exhaustive-deps

  // a different customer has different vouchers and discounts
  useEffect(() => { if (!editing) setDiscountPick(null); if (!(editing && base === 'sales_order')) setGiftPick(null); }, [custId]); // eslint-disable-line react-hooks/exhaustive-deps
  const saleTotal = Number(preview?.total) || 0;
  const saleNet = Number(preview?.subtotal) || 0;
  useEffect(() => {
    if (!custId || !SALES_SIDE.includes(base) || ['quotation', 'credit_note', 'delivery_note'].includes(base) || saleTotal <= 0) { setEnt(null); return undefined; }
    const t = setTimeout(() => {
      api.entitlements({ customer_id: custId, total: saleTotal, net: saleNet }).then((e) => {
        setEnt(e);
        setGiftPick((cur) => (cur === null && e.gift_vouchers?.length ? e.gift_vouchers.map((g) => g.code) : cur));   // ticked for them; they can untick
      }).catch(() => setEnt(null));
    }, 400);
    return () => clearTimeout(t);
  }, [custId, base, saleTotal, saleNet]); // eslint-disable-line react-hooks/exhaustive-deps

  // Is the money going through a bank? Then we ask how (transfer or cheque) — or, on a contra between cash and bank, for the slip.
  const isBankLedger = (l) => (l?.is_bank !== undefined ? Boolean(l.is_bank) : l?.group?.name === 'Bank Accounts');   // the server says which ledgers are banks (Bank Accounts and everything under it)
  const moneyMethod = methods.find((m) => String(m.id) === String(h.payment_method_id));
  const moneyLedger = ledgers.find((l) => String(l.id) === String(base === 'purchase' ? h.paid_ledger_id : h.ledger_id));
  const moneyBank = (isMoney && tenders.length === 0 && (moneyMethod ? Boolean(moneyMethod.is_bank) : isBankLedger(moneyLedger))) || (base === 'purchase' && cashPurchase && isBankLedger(moneyLedger));
  const bankAccepts = ((moneyMethod ? (moneyMethod.accepts ?? ledgers.find((l) => l.id === moneyMethod.ledger_id)?.accepts) : moneyLedger?.accepts) ?? '').split(',').filter(Boolean);
  const insTypes = [['eft', 'Electronic fund transfer'], ['transfer', 'Other transfer'], ['cheque', 'Cheque'], ['mobile', 'Mobile money'], ['card', 'Card']].filter(([k]) => !bankAccepts.length || bankAccepts.includes(k));
  const contraDr = entries.find((e) => e.side === 'D' && e.ledger_id);
  const contraCr = entries.find((e) => e.side === 'C' && e.ledger_id);
  const contraBankIn = base === 'contra' && contraDr && contraCr && isBankLedger(ledgers.find((l) => String(l.id) === String(contraDr.ledger_id))) && !isBankLedger(ledgers.find((l) => String(l.id) === String(contraCr.ledger_id)));
  const contraBankOut = base === 'contra' && contraDr && contraCr && !isBankLedger(ledgers.find((l) => String(l.id) === String(contraDr.ledger_id))) && isBankLedger(ledgers.find((l) => String(l.id) === String(contraCr.ledger_id)));
  const insMissing = (moneyBank && (!ins.type || (ins.type === 'cheque' && !ins.number.trim()))) || (contraBankIn && !slip.number.trim());

  const payload = useMemo(() => {
    const p = {
      voucher_type_id: Number(typeId), date: h.date, location_id: h.location_id || null, reference_no: h.reference_no || null, narration: h.narration || null,
      party_name: h.party_name || null, party_phone: h.party_phone || null, party_address: h.party_address || null, party_tax_id: h.party_tax_id || null,
      party_ledger_id: h.party_ledger_id || null, customer_id: h.customer?.customer_id ?? null, payment_method_id: h.payment_method_id || null, due_date: h.due_date || null,
      paid_ledger_id: base === 'purchase' && cashPurchase ? (h.paid_ledger_id || null) : undefined,
      currency_id: editing && h.currency_id ? Number(h.currency_id) : undefined,   // an edit keeps the voucher's own currency; a new one is in the base currency
      valid_until: h.valid_until || undefined,
    };
    if (hasItems) {
      p.lines = lines.map((l) => {
        const b = { type: l.type, quantity: Number(l.quantity) || 0, discount: Number(l.discount) || 0, notes: l.notes || undefined };
        if (l.type === 'product') return { ...b, variant_id: l.variant_id, variant_unit_id: l.variant_unit_id || undefined, rate: l.rate === '' ? undefined : Number(l.rate), batch_id: l.batch_id || undefined };
        if (l.type === 'service') return { ...b, service_id: l.service_id, service_variant_id: l.service_variant_id, rate: l.rate === '' ? undefined : Number(l.rate), materials: (l.materials ?? []).map(materialPayload) };
        if (l.type === 'hamper') return { type: 'hamper', hamper_id: l.hamper_id, quantity: b.quantity, discount: b.discount };
        if (l.type === 'charge') return l.kind === 'shipping' && l.shipping_option_id
          ? { type: 'charge', kind: 'shipping', shipping_option_id: l.shipping_option_id, waive: l.waive || undefined }
          : { type: 'charge', kind: l.kind, amount: Number(l.amount) || 0, description: l.description || undefined, ledger_id: l.ledger_id || undefined };
        return { ...b, type: 'custom', description: l.description, rate: Number(l.rate) || 0, ledger_id: l.ledger_id || undefined };
      });
    } else if (isMoney) {
      p.amount = Number(h.amount) || 0;
      p.ledger_id = h.ledger_id || undefined;
      if (refund) p.refund_of = refund.id;
      else p.allocations = Object.entries(alloc).filter(([, v]) => Number(v) > 0).map(([against_voucher_id, v]) => ({ against_voucher_id: Number(against_voucher_id), amount: Number(v) }));
      if (base === 'receipt' && isAdvance) { p.is_advance = true; p.advance_for = advanceFor.trim() || undefined; }
      if (moneyBank && ins.type) p.instrument = { type: ins.type, number: ins.number.trim() || undefined, date: ins.date || undefined, bank_name: ins.bank_name.trim() || undefined };
      if (wh.tax_rate_id) p.withholding = { tax_rate_id: Number(wh.tax_rate_id), amount: wh.amount === '' ? undefined : Number(wh.amount), certificate_no: wh.certificate_no || undefined };
    } else if (isEntries) {
      p.entries = entries.map((e) => ({ ledger_id: e.ledger_id, side: e.side, amount: Number(e.amount) || 0 }));
      if (contraBankIn || contraBankOut) p.slip = { number: slip.number.trim() || undefined, date: slip.date || undefined, by: slip.by.trim() || undefined };
    }
    if (expiredOverride.on && expiredOverride.reason.trim()) p.expired_override = { reason: expiredOverride.reason.trim() };
    if (base === 'sales' || base === 'cash_sale') p.rounding = rounding;
    if (!editing && ['sales', 'sales_order'].includes(base) && custCredits.length) {   // "use it?" — ticked unless they untick
      const ids = custCredits.filter((c) => (creditPick ?? custCredits.map((x) => x.voucher_id)).includes(c.voucher_id)).map((c) => c.voucher_id);
      if (ids.length) { if (base === 'sales') p.apply_credit = ids; else p.use_credit = ids; }
    }
    if (base === 'sales_order' && giftPick?.length) p.gift_codes = giftPick;   // only remembered; the invoice or cash sale spends them
    if (h.customer && discountPick !== null) p.discount_choices = discountPick;   // which of the customer's discounts to apply
    if (!tenders.length && base === 'cash_sale' && giftPlan.length) {
      const giftMethod = methods.find((m) => m.kind === 'gift_voucher');
      const rest = Math.max(0, lastTotal.current - giftPlan.reduce((t, g) => t + g.applied, 0));
      if (giftMethod && (rest <= 0.004 || h.payment_method_id)) {   // the rest needs a payment method, or the server cannot price it
        p.tenders = [...giftPlan.map((g) => ({ payment_method_id: giftMethod.id, amount: g.applied, gift_voucher_code: g.code })), ...(rest > 0.004 && h.payment_method_id ? [{ payment_method_id: Number(h.payment_method_id) }] : [])];
      }
    }
    if (tenders.length) p.tenders = tenders.map((t) => ({ payment_method_id: t.payment_method_id, amount: t.amount === '' ? undefined : Number(t.amount), gift_voucher_code: t.code || undefined, reference: t.reference || undefined }));
    if (!editing) {
      if (manual && h.voucher_number) p.voucher_number = h.voucher_number;
      else if (h.series_id) p.series_id = h.series_id;
    }
    return p;
  }, [typeId, h, lines, entries, tenders, wh, alloc, ins, slip, moneyBank, contraBankIn, contraBankOut, refund, isAdvance, advanceFor, custCredits, creditPick, hasItems, isMoney, isEntries, manual, editing, expiredOverride, discountPick, giftPlan, giftPick, base, methods, preview?.total, rounding, cashPurchase]);

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

  const clearCustomer = () => setH((x) => ({ ...x, customer: null, party_ledger_id: '' }));
  const clearParty = () => setH((x) => ({ ...x, party_ledger_id: '', customer: null }));
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  // Products, services and hampers belong to the E-commerce module: with it off they cannot go on a voucher
  useModuleStore((st) => st.active);   // re-render when the switch changes
  const lineOff = (t) => ({ product: !isModuleActive(MODULES.ECOMMERCE), service: !isModuleActive(MODULES.ECOMMERCE), hamper: !isModuleActive(MODULES.HAMPERS) }[t] ?? false);
  const offTypes = [...new Set(lines.map((l) => l.type).filter(lineOff))];
  const addLine = (t) => {
    if (lineOff(t)) { toast.error('The E-commerce module is currently switched off, so products, services and hampers cannot be added.'); return; }
    setLines((ls) => [...ls, emptyLine(t)]);
  };
  // Picking a service on a sales document also adds the fees ticked for it (call-out, service charge…) as lines of their own, each with its own account and tax; delete or change any
  const FEE_DOCS = ['quotation', 'sales_order', 'sales', 'cash_sale'];
  const pickService = (key, r) => {
    const fees = FEE_DOCS.includes(base) ? (r.fees ?? []) : [];
    setLines((ls) => {
      const next = ls.map((x) => (x.key === key ? { ...x, service_id: r.service_id, service_variant_id: r.service_variant_id, label: `${r.service} — ${r.package}`, rate: '', materials: (r.materials ?? []).map((m) => ({ ...newMaterial(m.mode), variant_id: m.variant_id, variant_unit_id: m.variant_unit_id, unit_code: m.unit_code, label: variantLabel(m.product, m.variant), quantity: m.quantity })) } : x));
      const at = next.findIndex((x) => x.key === key);
      const extra = fees.map((f) => ({ ...emptyLine('custom'), description: f.name, rate: f.amount, ledger_id: f.ledger_id }));
      return [...next.slice(0, at + 1), ...extra, ...next.slice(at + 1)];
    });
    if (fees.length) toast.success(`Added ${fees.length} service charge${fees.length === 1 ? '' : 's'} ticked for this service — change or delete any.`);
  };
  // for a service line already on the form (or a quotation that was requested): add the fees ticked for its package, after that line
  const addCharges = async (line) => {
    try {
      const rows = await api.lookup('service', '', undefined, { service_variant_id: line.service_variant_id });
      const fees = rows?.[0]?.fees ?? [];
      if (!fees.length) { toast('No service charges are ticked for this service.'); return; }
      setLines((ls) => {
        const at = ls.findIndex((x) => x.key === line.key);
        const extra = fees.map((f) => ({ ...emptyLine('custom'), description: f.name, rate: f.amount, ledger_id: f.ledger_id }));
        return [...ls.slice(0, at + 1), ...extra, ...ls.slice(at + 1)];
      });
      toast.success(`Added ${fees.length} service charge${fees.length === 1 ? '' : 's'} — change or delete any.`);
    } catch (e) { toast.error(errMsg(e, 'Could not load the service charges')); }
  };
  const setEntry = (i, patch) => setEntries((es) => es.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const dr = entries.filter((e) => e.side === 'D').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const cr = entries.filter((e) => e.side === 'C').reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const save = async () => {
    if (offTypes.length) { toast.error('The E-commerce module is currently switched off, so this voucher cannot be saved with product, service or hamper lines.'); return; }
    setSaving(true); setSaveErr(null);
    try {
      const res = editing ? await api.updateVoucher(id, payload) : await api.createVoucher(payload);
      toast.success(res.message ?? 'Saved');
      nav(viewPath(res.data.id));
    } catch (e) { const m = errMsg(e, 'Could not save the voucher'); setSaveErr(m); toast.error(m, { duration: 7000 }); }
    finally { setSaving(false); }
  };

  // lines post to income/expense accounts — customers', suppliers', cash and bank accounts are moved with receipts, payments, journals and notes
  const lineLedgers = ledgers.filter((l) => !['Sundry Debtors', 'Sundry Creditors', 'Cash-in-hand', 'Bank Accounts'].includes(l.group?.name) && !(['purchase', 'debit_note'].includes(base) && notForPurchaseLines(l)));
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
            {!editing && ['credit_note', 'debit_note'].includes(base) && <InvoiceFinder base={base} />}
            <div style={{ ...card, padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
              <div>
                <label style={label}>Voucher type</label>
                <select value={typeId} disabled={editing} onChange={(e) => { setTypeId(e.target.value); setLines([]); setPreview(null); }} style={small}>
                  <option value="">Choose…</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {editing && currencies.length > 0 && h.currency_id && !currencies.find((c) => String(c.id) === String(h.currency_id))?.is_base && (
                <div>
                  <label style={label}>Currency</label>
                  <select value={h.currency_id} onChange={(e) => setH((x) => ({ ...x, currency_id: e.target.value }))} style={small} aria-label="Currency of this voucher">
                    {currencies.filter((c) => c.is_active !== false).map((c) => <option key={c.id} value={c.id}>{c.code}{c.is_base ? ' (base)' : ''}</option>)}
                  </select>
                  <p style={{ margin: '4px 0 0', fontSize: '0.68rem', color: colors.textMuted }}>Made in {currencies.find((c) => String(c.id) === String(origCurrency.current))?.code ?? 'another currency'}; the base is now {currencies.find((c) => c.is_base)?.code}. Keep it, or change it.</p>
                </div>
              )}
              <div><label style={label}>Date</label><input type="date" value={h.date} onChange={(e) => setH((x) => ({ ...x, date: e.target.value }))} style={small} /></div>
              <div>
                <label style={label}>Branch</label>
                <select value={h.location_id} onChange={(e) => setH((x) => ({ ...x, location_id: e.target.value }))} style={small}>
                  {limitBranches(branches, 'books', h.location_id).filter((b) => branchAllowed(base, b) || String(b.id) === String(h.location_id)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              {!editing && series.length > 0 && (
                <div>
                  <label style={label}>Numbering</label>
                  {manual
                    ? <input value={h.voucher_number} onChange={(e) => setH((x) => ({ ...x, voucher_number: noSlash(e.target.value, 'A voucher number') }))} placeholder="Type the number" style={small} />
                    : <select value={h.series_id} onChange={(e) => setH((x) => ({ ...x, series_id: e.target.value }))} style={small}>{series.map((s) => <option key={s.id} value={s.id}>{s.next} · {s.name}</option>)}</select>}
                  {series.some((s) => s.allow_manual) && (
                    <label style={{ fontSize: '0.7rem', color: colors.textMuted, display: 'flex', gap: 4, marginTop: 4 }}><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> Type it myself</label>
                  )}
                </div>
              )}
              {(type?.party_kind === 'customer' || base === 'cash_sale') && hasItems && (
                <div style={base !== 'cash_sale' && !h.customer && !h.party_name ? { ...NEEDS, padding: 8 } : undefined} data-needs={base !== 'cash_sale' && !h.customer && !h.party_name ? 'customer' : undefined}>
                  <label style={{ ...label, ...(base !== 'cash_sale' && !h.customer && !h.party_name ? { color: '#b91c1c' } : {}) }}>Customer {base === 'cash_sale' && !h.customer && <span style={{ fontWeight: 600 }}>— optional</span>} {base !== 'cash_sale' && !h.customer && !h.party_name && <span style={{ fontWeight: 600 }}>— choose one</span>} {h.customer && <button type="button" onClick={clearCustomer} style={CLEAR_BTN}>Clear</button>}</label>
                  {h.customer ? <><div style={{ ...small, background: colors.tint(0.05) }}>{h.customer.name}</div><button type="button" onClick={clearCustomer} style={CHANGE_LINK}>Select another customer</button></>
                    : <Picker api={api} kind="customer" placeholder="Search customers (blank = walk-in)…" onPick={(c) => setH((x) => ({ ...x, customer: c, party_ledger_id: '' }))} render={(c) => <>{c.name} <span style={{ color: colors.textFaint }}>{c.email}</span></>} />}
                </div>
              )}
              {(type?.party_kind === 'customer' || base === 'cash_sale') && hasItems && !h.customer && (
                <>
                  <div><label style={label}>Not a customer? Type the name here</label><input value={h.party_name} onChange={(e) => setH((x) => ({ ...x, party_name: e.target.value }))} style={small} placeholder="Buyer's name (walk-in)" /></div>
                  <div><label style={label}>Their phone</label><input value={h.party_phone} onChange={(e) => setH((x) => ({ ...x, party_phone: e.target.value }))} style={small} /></div>
                  <div><label style={label}>Their address</label><input value={h.party_address} onChange={(e) => setH((x) => ({ ...x, party_address: e.target.value }))} style={small} /></div>
                  <div><label style={label}>Their PIN / tax ID</label><input value={h.party_tax_id} onChange={(e) => setH((x) => ({ ...x, party_tax_id: e.target.value }))} style={small} /></div>
                </>
              )}
              {base === 'purchase' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                    <input type="checkbox" checked={cashPurchase} onChange={(e) => setCashPurchase(e.target.checked)} /> Cash purchase — paid at once (cash, bank or M-Pesa), no supplier debt
                  </label>
                </div>
              )}
              {base === 'purchase' && cashPurchase && (
                <div style={!h.paid_ledger_id ? { ...NEEDS, padding: 8 } : undefined} data-needs={!h.paid_ledger_id ? 'paid' : undefined}>
                  <label style={{ ...label, ...(!h.paid_ledger_id ? { color: '#b91c1c' } : {}) }}>Paid from{!h.paid_ledger_id && <span style={{ fontWeight: 600 }}> — choose one</span>}</label>
                  <select value={h.paid_ledger_id} onChange={(e) => setH((x) => ({ ...x, paid_ledger_id: e.target.value }))} style={small} aria-label="Paid from">
                    <option value="">Choose a cash or bank account…</option>{moneyLedgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              {(type?.party_kind === 'supplier' || isMoney) && (
                <div style={!h.party_ledger_id && !(base === 'purchase' && cashPurchase) ? { ...NEEDS, padding: 8 } : undefined} data-needs={!h.party_ledger_id && !(base === 'purchase' && cashPurchase) ? 'party' : undefined}>
                  <label style={{ ...label, ...(!h.party_ledger_id && !(base === 'purchase' && cashPurchase) ? { color: '#b91c1c' } : {}) }}>{isMoney ? 'Party' : 'Supplier'}{!h.party_ledger_id && (base === 'purchase' && cashPurchase ? <span style={{ fontWeight: 600 }}> — optional</span> : <span style={{ fontWeight: 600 }}> — choose one</span>)}{h.party_ledger_id && <button type="button" onClick={clearParty} style={CLEAR_BTN}>Clear</button>}</label>
                  <select value={h.party_ledger_id} onChange={(e) => { setAlloc({}); setAllocTouched(false); setH((x) => ({ ...x, party_ledger_id: e.target.value, customer: null })); }} style={small}>
                    <option value="">Choose a ledger…</option>
                    {(type?.party_kind === 'supplier' ? partyLedgers.filter((l) => l.group?.name === 'Sundry Creditors') : (isMoney && !allParties ? partyLedgers : ledgers)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  {h.party_ledger_id && <button type="button" onClick={clearParty} style={CHANGE_LINK}>{isMoney ? 'Select another party' : 'Select another supplier'}</button>}
                  {isMoney && <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, fontSize: '0.72rem', color: colors.textMuted, cursor: 'pointer' }}><input type="checkbox" checked={allParties} onChange={(e) => setAllParties(e.target.checked)} /> Show every ledger (expenses, other accounts)</label>}
                </div>
              )}
              {base === 'purchase' && cashPurchase && !h.party_ledger_id && (
                <>
                  <div><label style={label}>Bought from (name)</label><input value={h.party_name} onChange={(e) => setH((x) => ({ ...x, party_name: e.target.value }))} style={small} placeholder="Seller's name" /></div>
                  <div><label style={label}>Their phone</label><input value={h.party_phone} onChange={(e) => setH((x) => ({ ...x, party_phone: e.target.value }))} style={small} /></div>
                  <div><label style={label}>Their address</label><input value={h.party_address} onChange={(e) => setH((x) => ({ ...x, party_address: e.target.value }))} style={small} /></div>
                  <div><label style={label}>Their PIN / tax ID</label><input value={h.party_tax_id} onChange={(e) => setH((x) => ({ ...x, party_tax_id: e.target.value }))} style={small} /></div>
                </>
              )}
              {needsMethod && !isMoney && (
                <div>
                  <label style={label}>Payment method</label>
                  <select value={h.payment_method_id} onChange={(e) => setH((x) => ({ ...x, payment_method_id: e.target.value }))} style={small}>
                    <option value="">Choose…</option>
                    {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}
              {isMoney && tenders.length === 0 && (
                <div>
                  <label style={label}>{base === 'receipt' ? 'Received into' : 'Paid from'}</label>
                  <select value={h.ledger_id} onChange={(e) => setH((x) => ({ ...x, ledger_id: e.target.value, payment_method_id: '' }))} style={small} aria-label={base === 'receipt' ? 'Received into' : 'Paid from'}>
                    <option value="">Choose a cash or bank account…</option>{moneyLedgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
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
              {(base === 'sales' || base === 'cash_sale') && (
                <div>
                  <label style={label}>Round the total</label>
                  <select value={rounding} onChange={(e) => setRounding(e.target.value)} style={small} aria-label="Round the total">
                    <option value="none">Do not round</option>
                    <option value="whole">Nearest whole number</option>
                    <option value="half">Nearest 0.50</option>
                  </select>
                </div>
              )}
              {base === 'quotation' && <div><label style={label}>Valid until</label><input type="date" value={h.valid_until} onChange={(e) => setH((x) => ({ ...x, valid_until: e.target.value }))} style={small} /></div>}
              {['sales', 'purchase'].includes(base) && <div><label style={label}>Due date</label><input type="date" value={h.due_date} onChange={(e) => setH((x) => ({ ...x, due_date: e.target.value }))} style={small} /></div>}
            </div>

            {type && hasItems && (
              <div style={{ ...card, padding: 18 }}>
                <p style={{ margin: '0 0 10px', fontWeight: 700, color: colors.text }}>Items</p>
                {lines.length === 0 && <p style={{ color: colors.textMuted, fontSize: '0.8rem' }}>Nothing added yet.</p>}
                {offTypes.length > 0 && <p style={{ color: colors.danger, fontSize: '0.8rem', fontWeight: 600 }}>The E-commerce module is currently switched off — remove the product, service or hamper lines below, or switch the module on, before saving.</p>}
                <div style={{ display: 'grid', gridTemplateColumns: LINE_COLS, gap: 8, padding: '6px 0', borderBottom: `2px solid ${colors.tint(0.14)}`, ...colHead }}>
                  <span>Name of item</span><span style={{ textAlign: 'right' }}>Quantity</span><span>per</span><span style={{ textAlign: 'right' }}>Rate</span><span style={{ textAlign: 'right' }}>Disc</span><span style={{ textAlign: 'right' }}>Amount</span><span />
                </div>
                {lines.map((l, idx) => {
                  const pv = preview?.lines?.[idx];
                  const money0 = l.type === 'charge';
                  const cellNum = { ...small, textAlign: 'right' };
                  return (
                  <div key={l.key} style={{ padding: '8px 0', borderTop: `1px solid ${colors.tint(0.06)}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: LINE_COLS, gap: 8, alignItems: 'start' }}>
                    <div>
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
                        : <Picker api={api} kind="service" placeholder="Search services…" onPick={(r) => pickService(l.key, r)} render={(r) => <>{r.service} <span style={{ color: colors.textFaint }}>{r.package}</span></>} />)}
                      {l.type === 'hamper' && (l.hamper_id
                        ? <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{l.label}<HamperLineBadges api={api} hamperId={l.hamper_id} name={l.label} customerId={h.customer?.customer_id} /></div>
                        : <Picker api={api} kind="hamper" extra={hamperExtra} placeholder="Search hampers…" onPick={(r) => setLine(l.key, { hamper_id: r.hamper_id, label: r.name })} render={(r) => <>{r.name} <span style={{ color: colors.textFaint }}>{money(r.price)}</span><Badges list={r.badges} /></>} />)}
                      {l.type === 'charge' && (
                        <select value={l.kind} onChange={(e) => setLine(l.key, { kind: e.target.value })} style={small}>
                          <option value="shipping">Shipping / delivery</option><option value="discount">Discount</option><option value="rounding">Rounding</option><option value="other">Other charge</option>
                        </select>
                      )}
                      {l.type === 'custom' && <input value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder="Description" style={small} />}
                      {l.type === 'charge' && l.kind === 'shipping' && (
                        <select value={l.shipping_option_id} onChange={(e) => setLine(l.key, { shipping_option_id: e.target.value ? Number(e.target.value) : '' })} style={{ ...small, marginTop: 4 }} aria-label="Delivery method">
                          <option value="">Delivery method…</option>
                          {shipOptions.map((o) => <option key={o.id} value={o.id}>{o.name} — {o.currency?.code} {money(o.cost)}</option>)}
                        </select>
                      )}
                      {l.type === 'charge' && l.kind !== 'shipping' && (
                        <select value={l.ledger_id} onChange={(e) => setLine(l.key, { ledger_id: e.target.value })} style={{ ...small, marginTop: 4 }} aria-label="Ledger"><option value="">{l.kind === 'other' ? 'Ledger…' : 'Ledger (auto)'}</option>{lineLedgers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                      )}
                      {l.type === 'custom' && (
                        <select value={l.ledger_id} onChange={(e) => setLine(l.key, { ledger_id: e.target.value })} style={{ ...small, marginTop: 4 }} aria-label="Ledger"><option value="">Ledger…</option>{lineLedgers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                      )}
                    </div>
                    {money0 ? <><span /><span /><span /><span /></> : (
                      <>
                        <input type="number" step="any" min="0" value={l.quantity} aria-label="Quantity" onChange={(e) => setLine(l.key, { quantity: e.target.value })} style={cellNum} />
                        {l.type === 'product' && (l.units?.length > 1) ? (
                          <select value={l.variant_unit_id ?? ''} aria-label="Unit" onChange={(e) => setLine(l.key, { variant_unit_id: Number(e.target.value), rate: '' })} style={small}>
                            {l.units.filter((u) => u.sellable || u.role === 'base').map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
                          </select>
                        ) : <span style={{ fontSize: '0.78rem', color: colors.textMuted, paddingTop: 8 }}>{pv?.unit_code ?? ''}</span>}
                        {l.type !== 'hamper' ? (
                          <input type="number" step="0.01" min="0" value={l.rate} aria-label="Rate" onChange={(e) => setLine(l.key, { rate: e.target.value })} style={cellNum}
                            placeholder={l.rate === '' && pv?.rate != null && l.type !== 'custom' ? money(pv.rate) : '0.00'} />
                        ) : <span />}
                        <input type="number" step="0.01" min="0" value={l.discount} aria-label="Discount" onChange={(e) => setLine(l.key, { discount: e.target.value })} style={cellNum} />
                      </>
                    )}
                    {money0 && !(l.kind === 'shipping') ? (
                      <input type="number" step="0.01" min="0" value={l.amount} aria-label="Amount" onChange={(e) => setLine(l.key, { amount: e.target.value })} style={cellNum} />
                    ) : (
                      <span style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.85rem', paddingTop: 8 }}>{pv ? money(pv.amount) : ''}</span>
                    )}
                    <button type="button" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} style={{ ...btnGhost, padding: '6px 8px', color: colors.danger }}><Trash2 size={14} /></button>
                  </div>
                    {l.type === 'service' && l.service_variant_id && FEE_DOCS.includes(base) && (
                      <button type="button" onClick={() => addCharges(l)} style={{ ...btnGhost, padding: '3px 10px', fontSize: '0.7rem', margin: '4px 0 0 8px' }}>+ Add this service's ticked charges</button>
                    )}
                    {l.type === 'service' && l.service_variant_id && (
                      <MaterialsEditor api={api} materials={l.materials ?? []} ledgers={ledgers} onChange={(m) => setLine(l.key, { materials: m })} />
                    )}
                  </div>
                  );
                })}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {[['product', 'Product'], ['service', 'Service'], ['hamper', 'Hamper'], ['charge', 'Charge / discount'], ['custom', 'Custom line']].filter(([t]) => !lineOff(t)).map(([t, l]) => (
                    <button key={t} type="button" onClick={() => addLine(t)} style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.75rem' }}><Plus size={12} /> {l}</button>
                  ))}
                </div>
              </div>
            )}

            {type && isMoney && (
              <div style={{ ...card, padding: 18, maxWidth: 640 }}>
                <label style={label}>Amount</label>
                <input type="number" step="0.01" min="0" max={refund ? refund.amount : undefined} value={h.amount} onChange={(e) => setH((x) => ({ ...x, amount: e.target.value }))} style={small} />
                {refund && <p role="status" style={{ margin: '8px 0 0', padding: '8px 10px', borderRadius: 8, background: colors.tint(0.05), fontSize: '0.78rem' }}>Giving back money paid on <strong>{refund.number}</strong> (up to {money(refund.amount)}). Choose the bank or cash account it is paid from.</p>}
                {base === 'receipt' && h.party_ledger_id && (
                  <div style={{ marginTop: 12 }}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.78rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={isAdvance} onChange={(e) => { setIsAdvance(e.target.checked); setAllocTouched(false); }} /> This is an advance — paid on purpose for something not yet supplied
                    </label>
                    {isAdvance && <input placeholder="What is it for? (order, project milestone, booking…)" value={advanceFor} onChange={(e) => setAdvanceFor(e.target.value)} style={{ ...small, marginTop: 6 }} />}
                    <p style={{ fontSize: '0.7rem', color: colors.textMuted, margin: '4px 0 0' }}>Anything not matched to a bill is kept for the customer: as an overpayment, or as an advance if ticked.</p>
                  </div>
                )}
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
              </div>
            )}

            {type && moneyBank && (
              <div style={{ ...card, padding: 18, maxWidth: 640 }}>
                <p style={{ margin: '0 0 10px', fontWeight: 700, color: colors.text }}>{base === 'receipt' ? 'How did the money arrive?' : 'How was it paid?'} <span style={{ fontWeight: 600, color: '#b91c1c', fontSize: '0.72rem' }}>{!ins.type && ' — choose one'}</span></p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
                  <div>
                    <label style={label}>By</label>
                    <select value={ins.type} onChange={(e) => setIns((x) => ({ ...x, type: e.target.value }))} style={small} aria-label="How it moved through the bank">
                      <option value="">Choose…</option>
                      {insTypes.map(([k, t2]) => <option key={k} value={k}>{t2}</option>)}
                    </select>
                  </div>
                  {ins.type && (
                    <>
                      <div><label style={label}>{ins.type === 'cheque' ? 'Cheque number *' : ins.type === 'mobile' ? 'Transaction code' : 'Reference'}</label><input value={ins.number} onChange={(e) => setIns((x) => ({ ...x, number: e.target.value }))} style={small} /></div>
                      {ins.type === 'cheque' && <div><label style={label}>Cheque date</label><input type="date" value={ins.date} onChange={(e) => setIns((x) => ({ ...x, date: e.target.value }))} style={small} /></div>}
                      {ins.type === 'cheque' && <div><label style={label}>{base === 'receipt' ? "Drawn on (customer's bank)" : 'Paid to bank'}</label><input value={ins.bank_name} onChange={(e) => setIns((x) => ({ ...x, bank_name: e.target.value }))} style={small} /></div>}
                    </>
                  )}
                </div>
                {ins.type === 'cheque' && ins.date && ins.date > h.date && <p style={{ margin: '8px 0 0', fontSize: '0.74rem', color: colors.warningText }}>Post-dated: the cheque is dated after this voucher. It is recorded as received and stays uncleared until it is banked.</p>}
                {ins.type === 'cheque' && base === 'receipt' && <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: colors.textMuted }}>A cheque is posted to the bank account now and marked uncleared until the cheque register clears it.</p>}
              </div>
            )}

            {type && isMoney && h.party_ledger_id && !refund && (
              <OpenBillsPanel ledgerId={Number(h.party_ledger_id)} base={base} amount={h.amount} exceptId={editing ? Number(id) : null}
                alloc={alloc} setAlloc={setAlloc} touched={allocTouched} setTouched={setAllocTouched} advance={base === 'receipt' && isAdvance} />
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

            {type && (contraBankIn || contraBankOut) && (
              <div style={{ ...card, padding: 18, maxWidth: 640 }}>
                <p style={{ margin: '0 0 10px', fontWeight: 700, color: colors.text }}>{contraBankIn ? 'Deposit slip' : 'Withdrawal slip (optional)'}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
                  <div><label style={label}>{contraBankIn ? 'Slip number *' : 'Cheque / slip number'}</label><input value={slip.number} onChange={(e) => setSlip((x) => ({ ...x, number: e.target.value }))} style={small} /></div>
                  <div><label style={label}>Slip date</label><input type="date" value={slip.date} onChange={(e) => setSlip((x) => ({ ...x, date: e.target.value }))} style={small} /></div>
                  {contraBankIn && <div><label style={label}>Deposited by</label><input value={slip.by} onChange={(e) => setSlip((x) => ({ ...x, by: e.target.value }))} style={small} /></div>}
                </div>
              </div>
            )}

            {type && (
              <div style={{ ...card, padding: 18 }}>
                <label style={label}>Narration</label>
                <textarea value={h.narration} onChange={(e) => setH((x) => ({ ...x, narration: e.target.value }))} rows={2} style={{ ...small, width: '100%' }} />
              </div>
            )}

            {h.customer && hasItems && discountOptions.length > 0 && (
              <div style={{ ...card, padding: 14 }}>
                <p style={{ margin: '0 0 4px', fontWeight: 700, color: colors.text }}>Discounts for {h.customer.name}</p>
                <p style={{ margin: '0 0 8px', fontSize: '0.74rem', color: colors.textMuted }}>Each one ticked is taken off the items before VAT, so the VAT is worked out on what is left.</p>
                <div style={{ display: 'grid', gap: 6 }}>
                  {discountOptions.map((o) => {
                    const on = (discountPick ?? []).includes(o.key);
                    return (
                      <label key={o.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={on} onChange={() => setDiscountPick((cur) => {
                          const c = cur ?? [];
                          if (c.includes(o.key)) return c.filter((k) => k !== o.key);
                          return o.kind === 'promo' ? [...c.filter((k) => !k.startsWith('promo:')), o.key] : [...c, o.key];   // one promo code per sale
                        })} />
                        <span style={{ flex: 1, minWidth: 0 }}>{o.label}{o.error && <span style={{ color: '#b91c1c', marginLeft: 8 }}>{o.error}</span>}{o.detail && <span style={{ display: 'block', fontSize: '0.7rem', color: colors.textMuted, marginTop: 1 }}>{o.detail}</span>}</span>
                        <span style={{ fontWeight: 700, color: on ? '#059669' : colors.textMuted }}>{on ? `−${money(o.amount)}` : `would take off ${money(o.amount)}`}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {custCredits.length > 0 && ['sales', 'sales_order'].includes(base) && (
              <div style={{ ...card, padding: 14 }}>
                <p style={{ margin: '0 0 8px', fontWeight: 700, color: colors.text }}>{base === 'sales' ? 'Money held for this customer' : 'Money held for this customer — use it when this becomes an invoice?'}</p>
                <div style={{ display: 'grid', gap: 6 }}>
                  {custCredits.map((c) => {
                    const on = (creditPick ?? custCredits.map((x) => x.voucher_id)).includes(c.voucher_id);
                    return (
                      <label key={c.voucher_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={on} onChange={() => setCreditPick((cur) => { const all = cur ?? custCredits.map((x) => x.voucher_id); return all.includes(c.voucher_id) ? all.filter((x) => x !== c.voucher_id) : [...all, c.voucher_id]; })} />
                        <span>{creditSentence(c, h.customer?.name)} — use it?</span>
                      </label>
                    );
                  })}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: colors.textMuted }}>{base === 'sales' ? 'Ticked ones settle this invoice when it is posted (up to what it comes to). No money moves.' : 'Remembered on the order; nothing is used until it is turned into an invoice.'}</p>
              </div>
            )}
            {ent && ent.gift_vouchers?.length > 0 && (
              <div style={{ ...card, padding: 14 }}>
                <p style={{ margin: '0 0 8px', fontWeight: 700, color: colors.text }}>Gift vouchers for {h.customer?.name}</p>
                <div style={{ display: 'grid', gap: 6 }}>
                  <span style={label}>{base === 'cash_sale' ? 'Tick to pay with them' : base === 'sales_order' ? 'Tick the ones meant for this order (nothing is spent until it becomes a Cash Sale)' : 'Paid on a Cash Sale'}</span>
                  {ent.gift_vouchers.map((g) => {
                    const on = (giftPick ?? []).includes(g.code);
                    const used = giftPlan.find((x) => x.code === g.code)?.applied;
                    return (
                      <label key={g.code} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', cursor: ['cash_sale', 'sales_order'].includes(base) ? 'pointer' : 'default' }}>
                        <input type="checkbox" disabled={!['cash_sale', 'sales_order'].includes(base)} checked={on && ['cash_sale', 'sales_order'].includes(base)} onChange={() => setGiftPick((cur) => ((cur ?? []).includes(g.code) ? cur.filter((c) => c !== g.code) : [...(cur ?? []), g.code]))} />
                        <span style={{ flex: 1 }}><strong>{g.code}</strong> <span style={{ color: colors.textMuted }}>· balance {money(g.balance)}{g.expires_at ? ` · expires ${g.expires_at}` : ''}</span></span>
                        <span style={{ fontWeight: 700 }}>{on && base === 'cash_sale' ? `applies ${money(used ?? 0)}` : `could cover ${money(g.applicable)}`}</span>
                      </label>
                    );
                  })}
                  {base === 'cash_sale' && giftPlan.length > 0 && (() => {
                    const byGift = giftPlan.reduce((t, g) => t + g.applied, 0);
                    const rest = Math.max(0, lastTotal.current - byGift);
                    const mName = methods.find((m) => String(m.id) === String(h.payment_method_id))?.name;
                    return <p role="status" style={{ margin: '4px 0 0', padding: '8px 10px', borderRadius: 8, background: colors.tint(0.05), fontSize: '0.8rem' }}>
                      Gift vouchers pay <strong>{money(byGift)}</strong> · {rest > 0.004 ? <>{mName ?? 'the payment method'} pays the rest: <strong>{money(rest)}</strong>{!mName && <span style={{ color: '#b91c1c' }}> — choose a payment method above</span>}</> : 'nothing is left to pay'}
                    </p>;
                  })()}
                </div>
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
                      Subtotal {money(preview.subtotal)}{(preview.tax_breakdown ?? []).length > 0 ? preview.tax_breakdown.map((t) => ` · ${t.label} ${money(t.amount)}`).join('') : (Number(preview.tax_total) ? ` · Tax ${money(preview.tax_total)}` : '')} · <strong>Total {preview.currency} {money(preview.total)}</strong>
                    </p>
                    {preview.stock?.length > 0 && <p style={{ textAlign: 'right', margin: '4px 0 0', fontSize: '0.72rem', color: colors.textMuted }}>Moves stock on {preview.stock.length} line(s).</p>}
                  </>
                )}
              </div>
            )}

            {saveErr && <p role="alert" style={{ margin: 0, padding: '10px 14px', borderRadius: 8, background: colors.dangerBg, color: colors.dangerText, fontSize: '0.85rem' }}>{saveErr}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" style={btnGhost} onClick={() => nav(-1)}>Cancel</button>
              <button type="button" style={{ ...btnPrimary, opacity: saving || !type || insMissing ? 0.6 : 1 }} disabled={saving || !type || insMissing} onClick={save}>{saving ? 'Saving…' : mode === 'quotation' ? 'Save prices' : editing ? 'Save changes' : 'Post voucher'}</button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
