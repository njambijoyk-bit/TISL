import { purchaseChargeLedgers } from '../../../components/admin/books/ledgerPicks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, PackagePlus, ChefHat, X } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import CurrencySelect from '../../../../_shared/components/common/currency/CurrencySelect';
import { NoAccess } from '../../../components/admin/ui/HubHeader';
import { money, today } from '../../../components/admin/books/booksFmt';
import { creditSentence } from '../../../components/admin/books/creditText';
import booksAPI from '../../../../_shared/api/books';
import CodeScanner from '../../../components/admin/codes/CodeScanner';
import { scanMatch } from '../../../lib/codes/scanLookup';
import locationsAPI from '../../../../_shared/api/locations';
import useAuthStore from '../../../../_shared/store/authStore';
import { canWriteFinance, hasPermission } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { defaultUnit, lookupStock, searchPlaceholder, stockKinds } from '../../../lib/stockKinds';
import { btnPrimary, btnGhost, card, colors, input } from '../../../../_shared/theme/tokens';
import useNarrow from '../../../components/admin/books/useNarrow';
import TaxLineRow from '../../../components/admin/books/TaxLineRow';
import LineTax from '../../../components/admin/books/LineTax';
import SystemMetadata from '../../../components/admin/books/SystemMetadata';
import LedgerPicker from '../../../components/admin/books/LedgerPicker';
import WithSidePanel from '../../../components/admin/books/VoucherSidePanel';
import { useCtrlKeys, useFKeys, voucherJumps } from '../../../components/admin/books/voucherKeys';

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

const CLEAR_BTN = { border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 800, padding: '1px 8px', borderRadius: 999, marginLeft: 6 };
const CHANGE_LINK = { border: 'none', background: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 700, padding: 0, marginTop: 4, textDecoration: 'underline' };
const small = { ...input, padding: '6px 8px', fontSize: '0.8rem' };
const label = { display: 'block', fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, marginBottom: 3 };
// the tax is worked out on this amount instead (only people holding books.tax.override can send it)
const taxBase = (l) => (l.tax_base !== undefined && l.tax_base !== '' ? { tax_base: Number(l.tax_base), tax_base_reason: l.tax_base_reason || undefined } : {});

const newKey = () => Math.random().toString(36).slice(2);

const draftKey = (kind, id) => `purchase-draft:${kind}:${id ?? 'new'}`;
const readDraft = (key) => { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } };
const writeDraft = (key, v) => { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode etc. — the draft is a convenience */ } };
const clearDraft = (key) => { try { sessionStorage.removeItem(key); } catch { /* ignore */ } };

const blankHeader = () => ({ date: today(), location_id: '', party_ledger_id: '', currency_id: '', exchange_rate: '', reference_no: '', supplier_invoice_no: '', payment_method_id: '', party_name: '', party_phone: '', party_address: '', party_tax_id: '', due_date: '', narration: '', opening_ledger_id: '' });
const blankTax = () => ({ key: newKey(), tax: true, tax_rate_id: '', base: '', amount: '' });   // a tax entered as a line of its own
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

/** A purchase line from a picked ingredient variant: the ingredient is the item, the variant is its variant; quantity is typed in packs, the bigger unit or the base unit, the cost is of one of those. */
const ingredientLineFrom = (row, currencyIsBase) => {
  const unit = defaultUnit(row.units);
  const per = row.units?.find((u) => u.unit === unit)?.per ?? 1;
  const suggested = currencyIsBase && row.last_cost > 0 ? Math.round(row.last_cost * per * 10000) / 10000 : '';
  return {
    key: newKey(), ingredient: true, item_id: row.item_id, label: row.ingredient, variantName: row.variant, sku: row.sku, units: row.units ?? [], unit, quantity: 1, rate: suggested, rate_auto: suggested !== '', discount: '',
    track_expiry: Boolean(row.track_expiry), last_cost: row.last_cost ?? 0, batch_no: '', mfg_date: '', expiry_date: '',
  };
};

/** Search-as-you-type over what this business stocks (products when E-commerce is on, ingredients when Menus is on), with near matches ("did you mean", only when nothing matches exactly) and "create new product" / "create kitchen stock", whichever the modules on allow. */
function ItemSearch({ onPick, onCreate, onCreateStock, onAddVariant, locationId }) {
  const kinds = stockKinds();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => { lookupStock(q, { purpose: 'purchase', locationId, kinds }).then(setRows).catch(() => setRows([])); }, 200);
    return () => clearTimeout(t);
  }, [q, open]); // eslint-disable-line react-hooks/exhaustive-deps
  // exact matches first; near matches ("did you mean") only when there is no exact match at all, whichever kind of item they are
  const exact = rows.filter((r) => !r.fuzzy);
  const shown = exact.length ? exact : rows;
  const fuzzy = exact.length === 0 && rows.length > 0;
  return (
    <div style={{ position: 'relative' }}>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => { clearTimeout(closeTimer.current); setOpen(true); }} onBlur={() => { closeTimer.current = setTimeout(() => setOpen(false), 180); }}
        placeholder={searchPlaceholder(kinds)} style={small} aria-label="Search items" />
      {open && (
        <div style={{ position: 'absolute', zIndex: 30, top: '100%', left: 0, right: 0, minWidth: 320, maxHeight: 340, overflowY: 'auto', ...card, padding: 4 }}>
          {shown.length === 0 && <p style={{ margin: 8, fontSize: '0.78rem', color: colors.textMuted }}>{q ? `Nothing matches “${q}”.` : 'Start typing to search.'}</p>}
          {fuzzy && <p style={{ margin: '6px 9px', fontSize: '0.72rem', color: colors.textMuted }}>No exact match — did you mean:</p>}
          {shown.map((r) => (r.type === 'ingredient' ? (
            <button key={`i${r.item_id}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(r); setQ(''); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>
              {r.ingredient} <span style={{ color: colors.textFaint }}>↳ {r.variant}{r.sku ? ` · ${r.sku}` : ''}</span>
              {r.track_expiry && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: colors.primary, fontWeight: 700 }}>EXPIRY</span>}
              {kinds.products && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: colors.textFaint, fontWeight: 700 }}>KITCHEN</span>}
            </button>
          ) : (
            <div key={r.variant_id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(r); setQ(''); setOpen(false); }}
                style={{ flex: 1, textAlign: 'left', padding: '7px 9px', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>
                {r.product} <span style={{ color: colors.textFaint }}>{r.variant && r.variant !== 'Standard' ? `${r.variant} · ` : ''}{r.sku}</span>
                {r.track_expiry && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: colors.primary, fontWeight: 700 }}>EXPIRY</span>}
                {!r.for_sale && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: colors.textFaint, fontWeight: 700 }}>MATERIAL</span>}
                {kinds.ingredients && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: colors.textFaint, fontWeight: 700 }}>PRODUCT</span>}
              </button>
              <button type="button" title={`Add another variant of ${r.product}`} onMouseDown={(e) => e.preventDefault()} onClick={() => onAddVariant(r.product_id)}
                style={{ padding: '4px 8px', background: 'none', border: `1px solid ${colors.tint(0.18)}`, borderRadius: 6, cursor: 'pointer', fontSize: '0.68rem', color: colors.textMuted, whiteSpace: 'nowrap' }}>
                + variant
              </button>
            </div>
          )))}
          {(kinds.products || kinds.ingredients) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
              {kinds.products && (
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onCreate(q)}
                  style={{ flex: '1 1 180px', display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left', padding: '9px', background: colors.tint(0.05), border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: colors.primary }}>
                  <PackagePlus size={14} /> Create new product{q ? ` “${q}”` : ''}
                </button>
              )}
              {kinds.ingredients && (
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onCreateStock(q)}
                  style={{ flex: '1 1 180px', display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left', padding: '9px', background: colors.tint(0.05), border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: colors.primary }}>
                  <ChefHat size={14} /> Create new kitchen stock{q ? ` “${q}”` : ''}
                </button>
              )}
            </div>
          )}
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
  const [methods, setMethods] = useState([]);
  const [branches, setBranches] = useState([]);
  const [h, setH] = useState(() => ({ ...blankHeader(), ...(draft0?.h ?? {}) }));
  const [lines, setLines] = useState(() => draft0?.lines ?? []);
  const narrowLines = useNarrow(760);   // on a phone the line's fields wrap into rows
  const [savedNotes, setSavedNotes] = useState(null);   // the system metadata the saved voucher already has (read-only)
  const [acct, setAcct] = useState(Boolean(draft0?.acct));   // an accounting invoice: ledger lines only (rent, fees, utilities), no items or stock
  const [loading, setLoading] = useState(editing);
  const [choose, setChoose] = useState(null);           // variants of a product just created / changed, to pick from
  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState(null);
  const [prepaid, setPrepaid] = useState([]);          // money already paid to this supplier in advance, offered on the bill
  const [prepaidPick, setPrepaidPick] = useState(null);   // ids ticked (null = all)
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const [restored, setRestored] = useState(Boolean(draft0));
  const handledProduct = useRef(false);

  const type = types.find((t) => t.base_type === baseType && t.is_active);
  const currencyIsBase = !h.currency_id;

  useEffect(() => {
    booksAPI.types().then(setTypes).catch((e) => toast.error(errMsg(e, 'Could not load voucher types')));
    booksAPI.paymentMethods().then((m) => setMethods((Array.isArray(m) ? m : m.data ?? []).filter((x) => x.is_active && x.kind !== 'gift_voucher' && x.ledger_id))).catch(() => {});
    booksAPI.ledgers({ all: 1, active_only: 1 }).then((r) => setLedgers(Array.isArray(r) ? r : r.data ?? [])).catch(() => {});
    locationsAPI.getAdmin().then((r) => {
      const act = (r.locations ?? []).filter((l) => l.is_active !== false);
      setBranches(act);
      const takes = act.filter((l) => l.receives_purchases !== false);   // goods are received into branches that take purchases
      setH((x) => (x.location_id ? x : { ...x, location_id: (takes.find((l) => l.is_default) ?? takes[0] ?? act[0])?.id ?? '' }));
    }).catch(() => {});
  }, []);

  // Editing: load the voucher (a kept draft, made before the admin left to create a product, wins)
  useEffect(() => {
    if (!editing) return;
    booksAPI.voucher(id).then(async (v) => {
      const base = v.type?.base_type;
      if (!['purchase', 'receipt_note', 'opening_stock'].includes(base)) { nav(`/admin/books/vouchers/${id}/edit`, { replace: true }); return; }
      if ((v.items ?? []).some((i) => !['product', 'ingredient', 'custom', 'charge'].includes(i.item_type))) { nav(`/admin/books/vouchers/${id}/edit`, { replace: true }); return; }
      setMode(base === 'opening_stock' ? 'opening' : base === 'receipt_note' ? 'receipt' : 'purchase');
      const d = readDraft(key);
      if (d) { setH({ ...blankHeader(), ...d.h }); setLines(d.lines ?? []); setAcct(Boolean(d.acct)); setRestored(true); return; }
      setAcct(v.meta?.invoice_mode === 'accounting');
      setSavedNotes(v.admin_notes ?? null);
      setH({ ...blankHeader(), date: v.date, location_id: v.location_id ?? '', party_ledger_id: v.party_ledger_id ?? '', currency_id: v.currency?.code && v.exchange_rate && Number(v.exchange_rate) !== 1 ? v.currency_id : '', exchange_rate: Number(v.exchange_rate) !== 1 ? v.exchange_rate : '', reference_no: v.reference_no ?? '', supplier_invoice_no: v.supplier_invoice_no ?? '', payment_method_id: v.payment_method_id ?? '', party_name: v.party_name ?? '', party_phone: v.party_phone ?? '', party_address: v.party_address ?? '', party_tax_id: v.party_tax_id ?? '', due_date: v.due_date ?? '', narration: v.narration ?? '' });
      const products = [...new Set((v.items ?? []).filter((i) => i.item_type === 'product').map((i) => i.product_id))];
      const info = {};
      await Promise.all(products.map((pid) => booksAPI.productVariants(pid).then((rows) => rows.forEach((r) => { info[r.variant_id] = r; })).catch(() => {})));
      const ingredientIds = (v.items ?? []).filter((i) => i.item_type === 'ingredient').map((i) => i.ingredient_item_id);
      const ingredientInfo = {};
      if (ingredientIds.length) await booksAPI.lookup('ingredient', '', 'purchase', { ids: ingredientIds.join(',') }).then((rows) => rows.forEach((r) => { ingredientInfo[r.item_id] = r; })).catch(() => {});
      setLines((v.items ?? []).map((i) => {
        if (i.item_type === 'ingredient') {
          const r = ingredientInfo[i.ingredient_item_id];
          const units = r?.units ?? [];
          // the unit it was typed in: packs, the bigger unit's code, or the base unit (what is stored is 'pack' or the unit's code)
          const unit = i.unit_code === 'pack' ? 'pack' : (units.find((u) => u.unit !== 'pack' && u.label === i.unit_code)?.unit ?? 'base');
          return { key: `i${i.id}`, ingredient: true, item_id: i.ingredient_item_id, label: i.description, variantName: i.variant_label, sku: i.sku, units, unit, quantity: Number(i.quantity), rate: Number(i.rate), rate_auto: false,
            discount: Number(i.discount_amount) || '', track_expiry: Boolean(r?.track_expiry || i.expiry_date), last_cost: r?.last_cost ?? 0, batch_no: i.batch_no ?? '', mfg_date: '', expiry_date: i.expiry_date ?? '', ...(() => { const o = (i.taxes ?? []).map((t) => t.calc_snapshot?.base_override).find(Boolean); return o ? { tax_base: o.to, tax_base_reason: o.reason ?? '' } : {}; })() };
        }
        if (i.item_type === 'custom' && i.notes === '__tax_line') { const t = (i.taxes ?? [])[0] ?? {}; return { key: `i${i.id}`, tax: true, tax_rate_id: t.tax_rate_id ?? '', base: t.base_amount ? Number(t.base_amount) : '', amount: t.tax_amount != null ? Number(t.tax_amount) : '' }; }
        if (i.item_type !== 'product') return { key: `i${i.id}`, other: true, description: i.description, quantity: Number(i.quantity), rate: Number(i.item_type === 'charge' ? i.amount : i.rate), ledger_id: i.ledger_id ?? '' };
        const r = info[i.variant_id];
        const base0 = r ? lineFrom(r, false) : { units: [], track_expiry: Boolean(i.batch_no || i.expiry_date) };
        return { ...base0, key: `i${i.id}`, variant_id: i.variant_id, product_id: i.product_id, label: `${i.description}${i.variant_label && i.variant_label !== 'Standard' ? ` — ${i.variant_label}` : ''}`,
          variant_unit_id: i.variant_unit_id ?? base0.variant_unit_id, quantity: Number(i.quantity), rate: Number(i.rate), rate_auto: false, discount: Number(i.discount_amount) || '',
          batch_no: i.batch_no ?? '', mfg_date: i.mfg_date ?? '', expiry_date: i.expiry_date ?? '', ...(() => { const o = (i.taxes ?? []).map((t) => t.calc_snapshot?.base_override).find(Boolean); return o ? { tax_base: o.to, tax_base_reason: o.reason ?? '' } : {}; })() };
      }));
    }).catch((e) => toast.error(errMsg(e, 'Could not load the purchase'))).finally(() => setLoading(false));
  }, [id, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the half-filled purchase while the admin is away creating a product
  useEffect(() => {
    if (loading) return;
    writeDraft(key, { h, lines, acct });
  }, [h, lines, acct, loading, key]);

  const addVariant = (row) => setLines((ls) => [...ls, row.type === 'ingredient' ? ingredientLineFrom(row, currencyIsBase) : lineFrom(row, currencyIsBase)]);
  // Scan what arrived: a product already on the purchase counts one more; a carton code buys one carton.
  const scanAdd = async (code) => {
    const m = await scanMatch(code);
    if (!m) return;
    if (!m.variant_id || !m.product_id) { toast.error(`${m.label} is not something that can be bought here.`); return; }
    const have = lines.find((l) => l.variant_id === m.variant_id && (m.type !== 'pack' || String(l.variant_unit_id) === String(m.id)));
    if (have) { setLines((ls) => ls.map((l) => (l.key === have.key ? { ...l, quantity: (Number(l.quantity) || 0) + 1 } : l))); toast.success(`${m.label}: one more`, { duration: 1500 }); return; }
    try {
      const row = (await booksAPI.productVariants(m.product_id)).find((r) => r.variant_id === m.variant_id);
      if (!row) { toast.error(`${m.label} could not be added.`); return; }
      const line = lineFrom(row, currencyIsBase);
      if (m.type === 'pack' && line.units.some((u) => String(u.id) === String(m.id))) line.variant_unit_id = m.id;
      setLines((ls) => [...ls, line]);
      toast.success(`${m.label} added`, { duration: 1500 });
    } catch (e) { toast.error(errMsg(e, 'Could not add that item')); }
  };
  // a delivery or shipping ledger that holds a fixed amount: the line starts at it, in this invoice's currency (still editable)
  const suggestAmount = (key, ledgerId) => {
    if (!ledgerId) return;
    booksAPI.suggestedAmount(ledgerId, h.currency_id ? { currency_id: h.currency_id } : {}).then((r) => {
      if (r?.amount != null && r.amount > 0) setLines((ls) => ls.map((l) => (l.key === key && (l.rate === '' || l.rate == null || Number(l.rate) === 0) ? { ...l, rate: r.amount } : l)));
    }).catch(() => {});
  };
  // the ledger's tax was changed from a line: take the new ledgers and work the purchase out again
  const reloadLedgers = () => booksAPI.ledgers({ all: 1, active_only: 1 }).then((r) => { setLedgers(Array.isArray(r) ? r : r.data ?? []); setLines((ls) => [...ls]); }).catch(() => {});
  const setLine = (k, patch) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const removeLine = (k) => setLines((ls) => ls.filter((l) => l.key !== k));

  // Back from the kitchen stock form: the new item's variant goes on the purchase (one variant is added, several are offered)
  const handledStock = useRef(false);
  useEffect(() => {
    const ids = params.get('stock');
    if (!ids || loading || handledStock.current) return;
    handledStock.current = true;
    booksAPI.lookup('ingredient', '', 'purchase', { ids })
      .then((rows) => { if (rows.length === 1) { addVariant(rows[0]); toast.success(`${rows[0].ingredient} added`); } else if (rows.length > 1) setChoose(rows); })
      .catch((e) => toast.error(errMsg(e, 'Could not load the new item')))
      .finally(() => setParams((p) => { p.delete('stock'); return p; }, { replace: true }));
  }, [params, loading]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const [dupes, setDupes] = useState([]);
  useEffect(() => {
    const no = (h.supplier_invoice_no || '').trim();
    if (receipt || !no || !h.party_ledger_id) { setDupes([]); return undefined; }
    const t = setTimeout(() => booksAPI.checkSupplierInvoice({ party_ledger_id: h.party_ledger_id, no, exclude_id: id || undefined }).then((r) => setDupes(r.duplicates ?? [])).catch(() => setDupes([])), 400);
    return () => clearTimeout(t);
  }, [h.supplier_invoice_no, h.party_ledger_id, receipt, id]);

  const goProduct = (path, extra = '') => {
    writeDraft(key, { h, lines, acct });
    nav(`${path}?returnTo=${encodeURIComponent(selfPath)}${extra}`);
  };
  const createProduct = (name) => goProduct('/admin/products/create', name ? `&name=${encodeURIComponent(name)}` : '');
  const createStock = (name) => { writeDraft(key, { h, lines, acct }); nav(`/admin/menus/ingredients?new=${encodeURIComponent(name || '')}&returnTo=${encodeURIComponent(selfPath)}`); };
  const addVariantTo = (productId) => goProduct(`/admin/products/${productId}/edit`, '&tab=variants');

  const canOverrideTax = hasPermission(user, 'books.tax.override');
  const payload = useMemo(() => {
    const p = {
      voucher_type_id: type?.id, date: h.date, location_id: h.location_id || null, reference_no: h.reference_no || null, supplier_invoice_no: receipt ? null : (h.supplier_invoice_no || null), narration: h.narration || null,
      currency_id: h.currency_id || null, exchange_rate: h.exchange_rate === '' ? undefined : Number(h.exchange_rate),
      lines: lines.map((l) => (l.tax
        ? { type: 'tax', tax_rate_id: Number(l.tax_rate_id) || undefined, base: l.base === '' ? undefined : Number(l.base), amount: l.amount === '' ? undefined : Number(l.amount) }
        : l.other
        ? { type: 'custom', description: l.description, quantity: Number(l.quantity) || 1, rate: Number(l.rate) || 0, ledger_id: l.ledger_id || undefined, ...taxBase(l) }
        : l.ingredient
          ? { type: 'ingredient', ingredient_item_id: l.item_id, unit: l.unit, quantity: Number(l.quantity) || 0, rate: l.rate === '' ? undefined : Number(l.rate), discount: Number(l.discount) || 0,
            batch_no: l.batch_no || undefined, expiry_date: l.expiry_date || undefined, ...taxBase(l) }
          : { type: 'product', variant_id: l.variant_id, variant_unit_id: l.variant_unit_id || undefined, quantity: Number(l.quantity) || 0,
          rate: l.rate === '' ? undefined : Number(l.rate), discount: Number(l.discount) || 0,
          batch_no: l.track_expiry || l.batch_no ? l.batch_no || undefined : undefined, mfg_date: l.mfg_date || undefined, expiry_date: l.expiry_date || undefined, ...taxBase(l) })),
    };
    if (acct && mode === 'purchase') p.meta = { invoice_mode: 'accounting' };
    if (opening) p.opening_ledger_id = h.opening_ledger_id || undefined;
    else {
      p.party_ledger_id = h.party_ledger_id || null; p.due_date = receipt ? null : h.due_date || null;
      if (!receipt) {
        p.payment_method_id = h.payment_method_id || undefined;
        Object.assign(p, { party_name: h.party_name || null, party_phone: h.party_phone || null, party_address: h.party_address || null, party_tax_id: h.party_tax_id || null });
      }
    }
    return p;
  }, [type, h, lines, opening, receipt, acct, mode]);

  const ready = Boolean(type) && lines.length > 0 && lines.every((l) => (l.tax ? l.tax_rate_id && (l.amount !== '' || Number(l.base) > 0) : l.other ? l.description && l.rate !== '' && l.ledger_id : l.ingredient ? l.item_id && Number(l.quantity) > 0 && l.rate !== '' && (!l.track_expiry || l.expiry_date) : l.variant_id && Number(l.quantity) > 0 && l.rate !== '')) && (opening || Boolean(h.party_ledger_id) || Boolean(h.payment_method_id));

  // what is still missing before the server can work the entries out (shown instead of a breakdown that quietly disappears)
  const missing = [
    ...lines.filter((l) => l.ingredient && l.item_id && l.track_expiry && !l.expiry_date).map((l) => `${l.label} ${l.variantName} needs its expiry date`),
    ...(!opening && lines.length > 0 && !h.party_ledger_id && !h.payment_method_id ? ['choose the supplier or how it was paid'] : []),
    ...lines.filter((l) => !l.other && !l.tax && (l.ingredient ? !l.item_id || !(Number(l.quantity) > 0) || l.rate === '' : !l.variant_id || !(Number(l.quantity) > 0) || l.rate === '')).map((l) => `${l.label ?? 'an item'} needs a quantity and a cost`),
  ];
  useEffect(() => {
    if (!ready) { setPreview(null); setPreviewErr(null); return undefined; }
    const t = setTimeout(() => {
      booksAPI.previewVoucher(payload).then((p) => { setPreview(p); setPreviewErr(null); }).catch((e) => { setPreview(null); setPreviewErr(errMsg(e, 'Could not work out this purchase')); });
    }, 500);
    return () => clearTimeout(t);
  }, [payload, ready]);

  useEffect(() => {
    setPrepaidPick(null);
    if (editing || opening || receipt || !h.party_ledger_id) { setPrepaid([]); return; }
    booksAPI.openBills(h.party_ledger_id).then((d) => setPrepaid((d.credits ?? []).filter((c) => c.kind === 'prepaid'))).catch(() => setPrepaid([]));
  }, [h.party_ledger_id, editing, opening, receipt]);
  const prepaidIds = prepaid.filter((c) => (prepaidPick ?? prepaid.map((x) => x.voucher_id)).includes(c.voucher_id)).map((c) => c.voucher_id);

  const save = async () => {
    setSaving(true); setSaveErr(null);
    try {
      const body = !editing && prepaidIds.length ? { ...payload, apply_credit: prepaidIds } : payload;   // ticked prepayments settle this bill when it is posted
      // opening stock of ingredients: a voucher of its own for each variant (item = the ingredient, variant = the variant); what else is on it stays together
      const own = !editing && opening ? payload.lines.filter((x) => x.type === 'ingredient') : [];
      if (own.length > 1 || (own.length === 1 && payload.lines.length > 1)) {
        const rest = payload.lines.filter((x) => x.type !== 'ingredient');
        const ids = [];
        for (const line of own) { ids.push((await booksAPI.createVoucher({ ...payload, lines: [line] })).data.id); }
        if (rest.length) ids.push((await booksAPI.createVoucher({ ...payload, lines: rest })).data.id);
        clearDraft(key);
        toast.success(`${ids.length} opening stock vouchers posted`);
        nav(listPath);
        return;
      }
      const res = editing ? await booksAPI.updateVoucher(id, payload) : await booksAPI.createVoucher(body);
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
  const canAcct = mode === 'purchase' && !editing;   // a purchase (not a goods received note or opening stock) can be an accounting invoice
  // an accounting invoice buys what an expense or asset ledger stands for, so only those are offered
  const chargeLedgers = purchaseChargeLedgers(ledgers).filter((l) => !acct || (!['tax', 'stock', 'accumulated_depreciation', 'capital'].includes(l.kind) && ['expense', 'asset'].includes(l.group?.nature)));   // the "Other charge" lines are expenses
  const changeMode = () => {
    if (!canAcct) return;
    if (!acct) {
      if (lines.some((l) => !l.other && !l.tax) && !window.confirm('Switching to an accounting invoice removes the item lines. Continue?')) return;
      setLines((ls) => (ls.length && ls.every((l) => l.other || l.tax) ? ls : [blankOther()]));
    }
    setAcct(!acct);
  };
  const goTo = (t) => { if (t.base_type !== 'purchase') nav(`/admin/books/vouchers/new?type=${t.id}`); };   // what is typed here stays saved as a draft
  const jumps = voucherJumps(types, mode === 'purchase' ? 'purchase' : '', goTo);
  const dateRef = useRef(null);
  const focusDate = () => { const el = dateRef.current; if (el) { el.focus(); try { el.showPicker?.(); } catch { /* not allowed here: focus is enough */ } } };
  useFKeys(editing ? {} : { f2: focusDate, ...jumps.keyMap });
  useCtrlKeys({ h: changeMode, s: () => { if (ready && !saving) save(); } });
  const lineAmount = (l) => Math.max(0, (Number(l.quantity) || 0) * (Number(l.rate) || 0) - (Number(l.discount) || 0));
  const subtotal = lines.reduce((s, l) => s + lineAmount(l), 0);

  if (!canWrite) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="purchases" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '28px 24px', maxWidth: 1360, margin: '0 auto' }}>
      <WithSidePanel actions={[
        ...(!editing ? [{ keys: 'F2', label: 'Date', note: 'Change the date', onClick: focusDate }, { gap: true }, ...jumps.actions, { gap: true }] : []),
        ...(canAcct ? [{ keys: 'Ctrl+H', label: 'Change mode', note: acct ? 'Now: Accounting invoice' : 'Now: Item invoice', onClick: changeMode, active: acct }] : []),
        { keys: 'Ctrl+S', label: editing ? 'Save changes' : 'Accept', onClick: () => { if (ready && !saving) save(); }, disabled: !ready || saving },
        { gap: true },
        { keys: '', label: 'Cancel', onClick: () => nav(listPath) },
      ]}>
      <div style={{ maxWidth: 1100 }}>
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
                <div style={!h.party_ledger_id && !h.payment_method_id ? { border: '1.5px solid #dc2626', background: '#fef2f2', boxShadow: '0 0 0 3px rgba(220,38,38,0.10)', borderRadius: 10, padding: 8 } : undefined} data-needs={!h.party_ledger_id && !h.payment_method_id ? 'supplier' : undefined}>
                  <label style={{ ...label, ...(!h.party_ledger_id && !h.payment_method_id ? { color: '#b91c1c' } : {}) }}>{h.payment_method_id ? 'Supplier (optional)' : 'Supplier'}{!h.party_ledger_id && !h.payment_method_id && <span style={{ fontWeight: 600 }}> — choose one</span>}{h.party_ledger_id && <button type="button" onClick={() => setH((x) => ({ ...x, party_ledger_id: '' }))} style={CLEAR_BTN}>Clear</button>}</label>
                  <select value={h.party_ledger_id} onChange={(e) => setH((x) => ({ ...x, party_ledger_id: e.target.value }))} style={small}>
                    <option value="">{h.payment_method_id ? 'Not a vendor…' : 'Choose…'}</option>
                    {suppliers.map((l) => <option key={l.id} value={l.id}>{l.supplier_status === 'suspended' ? `${l.name}  (SUSPENDED)` : l.name}</option>)}
                  </select>
                  {suppliers.find((l) => String(l.id) === String(h.party_ledger_id))?.supplier_status === 'suspended' && (
                    <span style={{ display: 'inline-block', marginTop: 6, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 8px', borderRadius: 6, background: colors.dangerBg, color: colors.dangerText }}>Suspended vendor</span>
                  )}
                  {h.party_ledger_id && <button type="button" onClick={() => setH((x) => ({ ...x, party_ledger_id: '' }))} style={CHANGE_LINK}>Select another supplier</button>}
                </div>
              )}
              {!opening && !receipt && (
                <div>
                  <label style={label}>Payment</label>
                  <select value={h.payment_method_id} onChange={(e) => setH((x) => ({ ...x, payment_method_id: e.target.value }))} style={small} aria-label="Payment">
                    <option value="">On credit — we owe the supplier</option>
                    {methods.map((m) => <option key={m.id} value={m.id}>Paid at once — {m.name}</option>)}
                  </select>
                </div>
              )}
              {!opening && !receipt && !h.party_ledger_id && (
                <>
                  <div><label style={label}>Bought from (name)</label><input value={h.party_name} onChange={(e) => setH((x) => ({ ...x, party_name: e.target.value }))} style={small} /></div>
                  <div><label style={label}>Their phone</label><input value={h.party_phone} onChange={(e) => setH((x) => ({ ...x, party_phone: e.target.value }))} style={small} /></div>
                  <div><label style={label}>Their address</label><input value={h.party_address} onChange={(e) => setH((x) => ({ ...x, party_address: e.target.value }))} style={small} /></div>
                  <div><label style={label}>Their PIN / tax ID</label><input value={h.party_tax_id} onChange={(e) => setH((x) => ({ ...x, party_tax_id: e.target.value }))} style={small} /></div>
                </>
              )}
              <div><label style={label}>Date</label><input ref={dateRef} type="date" value={h.date} onChange={(e) => setH((x) => ({ ...x, date: e.target.value }))} style={small} /></div>
              <div>
                <label style={label}>Received at branch</label>
                <select value={h.location_id} onChange={(e) => setH((x) => ({ ...x, location_id: e.target.value }))} style={small}>
                  {branches.filter((b) => b.receives_purchases !== false || String(b.id) === String(h.location_id)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
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
                  {!receipt && (
                    <div>
                      <label style={label}>Supplier invoice no.</label>
                      <input value={h.supplier_invoice_no} onChange={(e) => setH((x) => ({ ...x, supplier_invoice_no: e.target.value }))} style={small} />
                      {dupes.length > 0 && <div role="alert" style={{ marginTop: 4, fontSize: '0.7rem', color: '#b45309' }}>This supplier was already billed under this number: {dupes.map((d) => d.voucher_number).join(', ')}.</div>}
                    </div>
                  )}
                  <div><label style={label}>{receipt ? 'Delivery note no.' : 'Ref (LPO, delivery note…)'}</label><input value={h.reference_no} onChange={(e) => setH((x) => ({ ...x, reference_no: e.target.value }))} style={small} /></div>
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
              {canAcct && <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: colors.textMuted }}><strong style={{ color: colors.primary }}>{acct ? 'Accounting invoice' : 'Item invoice'}</strong> · press Ctrl+H to change{acct ? ' · a bill with no stock: choose the expense or asset ledger, a description and the amount' : ''}</p>}
              {editing && acct && <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: colors.textMuted }}><strong style={{ color: colors.primary }}>Accounting invoice</strong> (ledger lines)</p>}
              {!acct && <div style={{ marginBottom: 12 }}>
                <ItemSearch onPick={addVariant} onCreate={createProduct} onCreateStock={createStock} onAddVariant={addVariantTo} locationId={h.location_id} />
                {stockKinds().products && <div style={{ marginTop: 8 }}><CodeScanner autoFocus={false} placeholder="…or scan what arrived (a carton code buys a carton)" onScan={scanAdd} /></div>}
              </div>}

              {choose && (
                <div style={{ ...card, padding: 12, marginBottom: 12, background: colors.tint(0.04) }}>
                  <p style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 700 }}>Which variant of {choose[0].product ?? choose[0].ingredient} did you buy?</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {choose.map((r) => (
                      <button key={r.variant_id ?? `i${r.item_id}`} type="button" style={{ ...btnGhost, padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => { addVariant(r); }}>
                        {r.variant && r.variant !== 'Standard' ? r.variant : 'Standard'}{r.sku ? ` · ${r.sku}` : ''}
                      </button>
                    ))}
                    <button type="button" style={{ ...btnGhost, padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => setChoose(null)}>Done</button>
                  </div>
                </div>
              )}

              {lines.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: colors.textMuted, margin: 0 }}>{acct ? 'No lines yet. Add a ledger line below.' : <>No items yet. Search above{stockKinds().products ? ', or create a new product if it is not in the system' : ''}.</>}</p>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {lines.map((l) => (l.tax
                    ? <TaxLineRow key={l.key} line={l} partyTax={preview?.party_tax} partyName={preview?.party} computed={preview?.lines?.[lines.indexOf(l)]} linesTotal={Number(preview?.subtotal) || 0} onChange={(patch) => setLine(l.key, patch)} onRemove={() => removeLine(l.key)} />
                    : (
                    <div key={l.key} style={{ border: `1px solid ${colors.tint(0.12)}`, borderRadius: 10, padding: 10 }}>
                      {l.other ? (<>
                        <div style={{ display: 'grid', gridTemplateColumns: narrowLines ? 'repeat(2, minmax(0, 1fr))' : 'minmax(160px,2fr) 70px 100px minmax(120px,1fr) 100px 30px', gap: 8, alignItems: 'end' }}>
                          {acct
                            ? <div><label style={label}>Particulars (ledger) *</label>
                              <LedgerPicker ledgers={[...chargeLedgers, ...ledgers.filter((x) => String(x.id) === String(l.ledger_id) && !chargeLedgers.some((c) => c.id === x.id))]} value={l.ledger_id} style={small}
                                autoFocus={!l.ledger_id && !l.description} onPick={(x) => { setLine(l.key, { ledger_id: x.id, description: l.description || x.name }); suggestAmount(l.key, x.id); }} /></div>
                            : <div><label style={label}>Other charge (freight, duty…)</label><input value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} style={small} /></div>}
                          <div><label style={label}>Qty</label><input type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} style={small} /></div>
                          <div><label style={label}>Amount each</label><input type="number" min="0" step="any" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} style={small} /></div>
                          {acct ? <div><label style={label}>Description</label><input value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} style={small} /></div> : <div>
                            <label style={label}>Ledger *</label>
                            <select value={l.ledger_id} onChange={(e) => { setLine(l.key, { ledger_id: e.target.value }); suggestAmount(l.key, e.target.value); }} style={small}>
                              <option value="">Choose…</option>
                              {[...chargeLedgers, ...ledgers.filter((x) => String(x.id) === String(l.ledger_id) && !chargeLedgers.some((c) => c.id === x.id))].map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                          </div>}
                          <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.85rem' }}>{money(lineAmount(l))}</div>
                          <button type="button" aria-label="Remove line" onClick={() => removeLine(l.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint }}><Trash2 size={15} /></button>
                        </div>
                        {l.ledger_id && <LineTax ledger={ledgers.find((x) => String(x.id) === String(l.ledger_id))} line={preview?.lines?.[lines.indexOf(l)]} onSaved={reloadLedgers} />}
                      </>
                      ) : l.ingredient ? (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,2fr) 100px 70px 100px 90px 100px 30px', gap: 8, alignItems: 'end' }}>
                            <div>
                              <label style={label}>Item</label>
                              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{l.label}</div>
                              <div style={{ fontSize: '0.74rem', color: colors.textMuted }}>↳ {l.variantName}{l.sku ? ` · ${l.sku}` : ''}</div>
                            </div>
                            <div>
                              <label style={label}>Unit</label>
                              <select value={l.unit} onChange={(e) => {
                                const u = l.units.find((x) => x.unit === e.target.value);
                                setLine(l.key, { unit: e.target.value, ...(l.rate_auto && u && l.last_cost > 0 ? { rate: Math.round(l.last_cost * u.per * 10000) / 10000 } : {}) });
                              }} style={small} aria-label="Unit">
                                {l.units.map((u) => <option key={u.unit} value={u.unit}>{u.unit === 'pack' ? `pack (${u.per} base)` : u.label}</option>)}
                              </select>
                            </div>
                            <div><label style={label}>Qty</label><input type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} style={small} /></div>
                            <div><label style={label}>Cost each</label><input type="number" min="0" step="any" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value, rate_auto: false })} style={small} /></div>
                            <div><label style={label}>Discount</label><input type="number" min="0" step="any" value={l.discount} onChange={(e) => setLine(l.key, { discount: e.target.value })} style={small} /></div>
                            <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.85rem' }}>{money(lineAmount(l))}</div>
                            <button type="button" aria-label="Remove line" onClick={() => removeLine(l.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint }}><Trash2 size={15} /></button>
                          </div>
                          {(() => {
                            const per = l.units.find((u) => u.unit === l.unit)?.per ?? 1;
                            return per !== 1 && Number(l.quantity) > 0 ? <div style={{ fontSize: '0.7rem', color: colors.textFaint, marginTop: 4 }}>= {Math.round(Number(l.quantity) * per * 10000) / 10000} in the base unit{Number(l.rate) > 0 ? ` at ${Math.round((Number(l.rate) / per) * 1000000) / 1000000} each` : ''}</div> : null;
                          })()}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginTop: 8 }}>
                            <div><label style={label}>Batch no.</label><input value={l.batch_no} onChange={(e) => setLine(l.key, { batch_no: e.target.value })} style={small} /></div>
                            {l.track_expiry && <div><label style={label}>Expiry date *</label><input type="date" value={l.expiry_date} onChange={(e) => setLine(l.key, { expiry_date: e.target.value })} style={small} /></div>}
                          </div>
                          {canOverrideTax && !l.other && (
                            l.tax_base_open || l.tax_base
                              ? <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: '0.72rem', color: colors.textMuted, flexWrap: 'wrap' }}>
                                <span>Tax is worked out on</span>
                                <input type="number" min="0" step="any" value={l.tax_base ?? ''} aria-label="Amount the tax is worked out on" placeholder={money(lineAmount(l))} onChange={(e) => setLine(l.key, { tax_base: e.target.value })} style={{ ...small, width: 110 }} />
                                <input type="text" maxLength={160} value={l.tax_base_reason ?? ''} aria-label="Reason for changing the tax base" placeholder="Reason" onChange={(e) => setLine(l.key, { tax_base_reason: e.target.value })} style={{ ...small, minWidth: 200 }} />
                                <button type="button" onClick={() => setLine(l.key, { tax_base: '', tax_base_reason: '', tax_base_open: false })} style={{ ...btnGhost, padding: '2px 8px', fontSize: '0.7rem' }}>Cancel</button>
                              </div>
                              : <button type="button" onClick={() => setLine(l.key, { tax_base_open: true })} style={{ ...btnGhost, padding: '2px 10px', fontSize: '0.7rem', marginTop: 6 }}>Change what the tax is worked out on</button>
                          )}
                        </>
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
                          {canOverrideTax && !l.other && (
                            l.tax_base_open || l.tax_base
                              ? <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: '0.72rem', color: colors.textMuted, flexWrap: 'wrap' }}>
                                <span>Tax is worked out on</span>
                                <input type="number" min="0" step="any" value={l.tax_base ?? ''} aria-label="Amount the tax is worked out on" placeholder={money(lineAmount(l))} onChange={(e) => setLine(l.key, { tax_base: e.target.value })} style={{ ...small, width: 110 }} />
                                <input type="text" maxLength={160} value={l.tax_base_reason ?? ''} aria-label="Reason for changing the tax base" placeholder="Reason" onChange={(e) => setLine(l.key, { tax_base_reason: e.target.value })} style={{ ...small, minWidth: 200 }} />
                                <button type="button" onClick={() => setLine(l.key, { tax_base: '', tax_base_reason: '', tax_base_open: false })} style={{ ...btnGhost, padding: '2px 8px', fontSize: '0.7rem' }}>Cancel</button>
                              </div>
                              : <button type="button" onClick={() => setLine(l.key, { tax_base_open: true })} style={{ ...btnGhost, padding: '2px 10px', fontSize: '0.7rem', marginTop: 6 }}>Change what the tax is worked out on</button>
                          )}
                        </>
                      )}
                    </div>
                    )))}
                </div>
              )}

              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={{ ...btnGhost, padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => setLines((ls) => [...ls, blankOther()])}><Plus size={13} /> {acct ? 'Add ledger line' : 'Service or other charge'}</button>
                {acct && <button type="button" style={{ ...btnGhost, padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => setLines((ls) => [...ls, blankTax()])}><Plus size={13} /> Add tax line</button>}
              </div>
            </div>

            {prepaid.length > 0 && (
              <div style={{ ...card, padding: 14 }}>
                <p style={{ margin: '0 0 8px', fontWeight: 700, color: colors.text }}>Money already paid to this supplier</p>
                <div style={{ display: 'grid', gap: 6 }}>
                  {prepaid.map((c) => (
                    <label key={c.voucher_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={(prepaidPick ?? prepaid.map((x) => x.voucher_id)).includes(c.voucher_id)}
                        onChange={() => setPrepaidPick((cur) => { const all = cur ?? prepaid.map((x) => x.voucher_id); return all.includes(c.voucher_id) ? all.filter((x) => x !== c.voucher_id) : [...all, c.voucher_id]; })} />
                      <span>{creditSentence(c, null, true)} — use it on this bill?</span>
                    </label>
                  ))}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: colors.textMuted }}>Ticked ones settle this bill when it is posted (up to what it comes to). No money moves.</p>
              </div>
            )}

            {!preview?.entries?.length && !previewErr && missing.length > 0 && (
              <div role="status" style={{ ...card, padding: 14, fontSize: '0.8rem', color: colors.textMuted }}>
                The accounting entries and the tax show once everything is filled in: {missing.join('; ')}.
              </div>
            )}
            {preview?.entries?.length > 0 && (
              <div style={{ ...card, padding: 18 }}>
                <p style={{ margin: '0 0 10px', fontWeight: 700, color: colors.text }}>What this will post</p>
                {preview.lines?.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', marginBottom: 12 }}>
                    <tbody>
                      {preview.lines.flatMap((l) => [l, ...(l.children ?? []).map((c) => ({ ...c, is_child: true }))]).map((l, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${colors.tint(0.05)}`, color: l.is_child ? colors.textMuted : colors.text }}>
                          <td style={{ padding: '5px 4px', paddingLeft: l.is_child ? 22 : 4 }}>{l.description}{l.variant_label && l.variant_label !== 'Standard' ? ` — ${l.variant_label}` : ''}</td>
                          <td style={{ textAlign: 'right' }}>{l.quantity} {l.unit_code}</td>
                          <td style={{ textAlign: 'right' }}>{money(l.amount)}</td>
                          <td style={{ textAlign: 'right', color: colors.textFaint }}>{l.tax_amount ? `tax ${money(l.tax_amount)}${l.tax_rate_percent ? ` (${Number(l.tax_rate_percent)}%)` : ''}` : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead><tr><th style={{ textAlign: 'left', padding: '4px', fontSize: '0.65rem', color: colors.textFaint }}> </th><th style={{ textAlign: 'left', fontSize: '0.65rem', color: colors.textFaint }}>Ledger</th><th style={{ textAlign: 'right', fontSize: '0.65rem', color: colors.textFaint }}>Debit</th><th style={{ textAlign: 'right', fontSize: '0.65rem', color: colors.textFaint }}>Credit</th></tr></thead>
                  <tbody>
                    {preview.entries.map((e, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${colors.tint(0.05)}` }}>
                        <td style={{ padding: '5px 4px', width: 40, color: colors.textFaint }}>{e.side === 'D' ? 'Dr' : 'Cr'}</td>
                        <td style={{ paddingLeft: e.side === 'C' ? 18 : 0 }}>{e.ledger}</td>
                        <td style={{ textAlign: 'right' }}>{e.side === 'D' ? money(e.amount) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{e.side === 'C' ? money(e.amount) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ textAlign: 'right', margin: '10px 0 0', fontSize: '0.85rem' }}>
                  Subtotal {money(preview.subtotal)}{(preview.tax_breakdown ?? []).length > 0 ? preview.tax_breakdown.map((t) => ` · ${t.label} ${money(t.amount)}`).join('') : (Number(preview.tax_total) ? ` · Tax ${money(preview.tax_total)}` : '')} · <strong>Total {preview.currency} {money(preview.total)}</strong>
                </p>
                {(preview.tax_breakdown ?? []).length > 0 && <p style={{ margin: '4px 0 0', textAlign: 'right', fontSize: '0.72rem', color: colors.textMuted }}>Input tax, claimable where the tax rules allow.</p>}
                {preview.stock?.length > 0 && <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: colors.textMuted }}>Brings stock in on {preview.stock.length} line(s).</p>}
              </div>
            )}

            <div style={{ ...card, padding: 18 }}>
              <div style={{ display: 'flex', gap: 24, justifyContent: 'flex-end', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                <div>Subtotal <strong>{money(preview?.subtotal ?? subtotal)}</strong></div>
                {!opening && !receipt && <div>Tax <strong>{preview ? money(preview.tax_total ?? 0) : '—'}</strong></div>}
                <div>Total <strong style={{ color: colors.primary }}>{preview || opening || receipt ? money(preview?.total ?? subtotal) : '—'}</strong></div>
              </div>
              {previewErr && <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#b91c1c' }}>{previewErr}</p>}
              {saveErr && <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#b91c1c' }}>{saveErr}</p>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
                <button type="button" style={btnGhost} onClick={() => nav(listPath)}>Cancel</button>
                <button type="button" style={{ ...btnPrimary, opacity: ready && !saving ? 1 : 0.6 }} disabled={!ready || saving} onClick={save}>{saving ? 'Saving…' : editing ? 'Save changes' : opening ? 'Post opening stock' : receipt ? 'Post goods received' : 'Post purchase'}</button>
              </div>
            </div>
            <SystemMetadata notes={editing ? savedNotes : preview?.admin_notes} pending={!editing} />
          </div>
        )}
      </div>
      </WithSidePanel>
      </div>
    </AdminLayout>
  );
}
