import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Minus, Plus, Printer, Receipt, X } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canRunFoodTill } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { colors } from '../../../_shared/theme/tokens';
import DishPicker from '../../components/DishPicker';
import { useBasket, lineTotal, basketItems, needsChoice, shownPrice } from '../../lib/basket';
import { printReceipt } from '../../lib/receiptPrint';
import LineMakeup from '../../components/LineMakeup';

const money = (n) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const big = (bg, fg = '#fff') => ({ padding: '12px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.95rem', background: bg, color: fg });
const line = { border: '1.5px solid var(--line, #cbd5e1)', background: 'transparent', color: 'inherit' };
const items = (b) => basketItems(b.lines);

/** What it comes to, and how it is paid: cash (with the change), M-Pesa or card with a reference, split across ways. */
function PayModal({ total, data, rules, service, quote: askQuote, onClose, onPay }) {
  const cash = data.payment_methods.find((m) => m.kind === 'cash');
  const [rows, setRows] = useState([{ payment_method_id: String(cash?.id ?? data.payment_methods[0]?.id ?? ''), amount: '', reference: '' }]);
  const [tip, setTip] = useState('');
  const [waive, setWaive] = useState(false);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [given, setGiven] = useState({});   // free condiments actually given, where the cashier changed the count: ingredient id -> count
  const [edits, setEdits] = useState([]);   // the cashier's changes to the packaging list: [{ item_id, quantity?, reason?, replaces? }]

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      askQuote({ tip: Number(tip) || 0, waive_service: waive, ...(edits.length ? { packaging: edits } : {}), ...(Object.keys(given).length ? { condiments: condimentList } : {}) }).then((q) => { if (live) { setQuote(q); setProblem(null); } }).catch((e) => { if (live) { setQuote(null); setProblem(errMsg(e, 'Could not price this')); } });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [tip, waive, edits, given]);   // eslint-disable-line react-hooks/exhaustive-deps

  const condimentList = Object.entries(given).map(([id, n]) => ({ ingredient_id: Number(id), given: n }));
  const due = quote?.total ?? total;
  const blocked = Boolean(quote?.packaging_waiver?.amount > 0 && !quote.packaging_waiver.allowed);   // taking off a compulsory, priced line needs the permission to waive
  const handed = rows.reduce((n, r) => n + (Number(r.amount) || 0), 0);
  const change = Math.max(0, handed - due);
  const short = Math.max(0, due - handed);
  const set = (i, p) => setRows((xs) => xs.map((r, n) => (n === i ? { ...r, ...p } : r)));
  const method = (r) => data.payment_methods.find((m) => String(m.id) === String(r.payment_method_id));
  // packaging: every change is an entry for the item as it stands now; the server sends the list back with the changes applied
  const putEdit = (entry, key = entry.item_id) => setEdits((xs) => [...xs.filter((x) => (x.replaces ?? x.item_id) !== key && x.item_id !== key), entry]);
  const setCount = (l, q) => {
    if (l.source === 'swapped') putEdit({ item_id: l.item_id, replaces: l.replaces_item_id, quantity: q, ...(q === 0 ? { reason: l.reason ?? '' } : {}) }, l.replaces_item_id);
    else putEdit({ item_id: l.item_id, quantity: q, ...(q === 0 ? { reason: l.reason ?? '' } : {}) });
  };
  const setReason = (l, reason) => (l.source === 'swapped' ? putEdit({ item_id: l.item_id, replaces: l.replaces_item_id, quantity: 0, reason }, l.replaces_item_id) : putEdit({ item_id: l.item_id, quantity: 0, reason }));
  const swapTo = (l, id) => { if (!id) return; const base = l.source === 'swapped' ? l.replaces_item_id : l.item_id; if (l.source === 'added') setEdits((xs) => [...xs.filter((x) => x.item_id !== l.item_id), { item_id: id, quantity: l.quantity }]); else putEdit({ item_id: id, replaces: base, quantity: l.quantity }, base); };
  const addItem = (id) => id && setEdits((xs) => [...xs, { item_id: id, quantity: 1 }]);

  const go = async () => {
    setBusy(true);
    try {
      await onPay({ tip: Number(tip) || 0, waive_service: waive, ...(edits.length ? { packaging: edits } : {}), ...(condimentList.length ? { condiments: condimentList } : {}), tenders: rows.filter((r) => Number(r.amount) > 0).map((r) => ({ payment_method_id: Number(r.payment_method_id), amount: Number(r.amount), reference: r.reference || undefined })) });
    } catch (e) { toast.error(errMsg(e, 'Could not take the payment'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title="Take payment" subtitle={`${service === 'dine_in' ? 'Dine in' : 'Take out'}`} onClose={onClose} width={520}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" style={{ ...big('transparent', 'inherit'), ...line }} onClick={onClose}>Back</button><button type="button" style={{ ...big('#059669'), opacity: busy || short > 0.004 || !quote || blocked ? 0.5 : 1 }} disabled={busy || short > 0.004 || !quote || blocked} onClick={go}>{busy ? 'Taking…' : `Take ${money(due)}`}</button></div>}>
      <div style={{ display: 'grid', gap: 12 }} data-testid="pay">
        {quote && (
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 12px' }}>
            <dt>Food</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(quote.subtotal)}</dd>
            <dt>Tax</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(quote.tax_total)}</dd>
            {quote.service_charge > 0 && <><dt>Service charge</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(quote.service_charge)}</dd></>}
            {quote.tip > 0 && <><dt>Tip</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(quote.tip)}</dd></>}
            <dt style={{ fontSize: '1.2rem', fontWeight: 900 }}>Total</dt><dd style={{ margin: 0, textAlign: 'right', fontSize: '1.2rem', fontWeight: 900 }} data-testid="due">{money(quote.total)}</dd>
          </dl>
        )}
        {(quote?.packaging?.length > 0 || (quote?.packaging_choices?.length > 0)) && (
          <div data-testid="packaging-list" style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--line, #cbd5e1)', paddingTop: 8 }}>
            <strong style={{ fontSize: '0.85rem' }}>Packaging</strong>
            {quote.packaging.map((l) => (
              <div key={l.item_id} data-testid="packaging-line" data-removed={l.removed ? 'yes' : 'no'} style={{ display: 'grid', gap: 4, opacity: l.removed ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 120 }}>{l.name}{l.compulsory && <small style={{ color: '#b45309' }}> compulsory</small>}{l.charged ? <small style={{ color: '#64748b' }}> {money(l.unit_price)} each</small> : <small style={{ color: '#64748b' }}> free</small>}</span>
                  <button type="button" aria-label={`Fewer ${l.name}`} disabled={l.quantity < 1} onClick={() => setCount(l, l.quantity - 1)} style={{ ...line, width: 32, height: 32, borderRadius: 8, cursor: 'pointer' }}>−</button>
                  <strong aria-label={`${l.name} count`} style={{ minWidth: 22, textAlign: 'center' }}>{l.quantity}</strong>
                  <button type="button" aria-label={`More ${l.name}`} disabled={l.quantity >= 99} onClick={() => setCount(l, l.quantity + 1)} style={{ ...line, width: 32, height: 32, borderRadius: 8, cursor: 'pointer' }}>+</button>
                  <span style={{ minWidth: 60, textAlign: 'right' }}>{l.charged ? money(l.amount) : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select aria-label={`Change ${l.name} to`} value="" onChange={(e) => swapTo(l, Number(e.target.value))} style={{ padding: 6, borderRadius: 8, fontSize: '0.8rem', ...line }}>
                    <option value="">Change to…</option>
                    {quote.packaging_choices.filter((c) => !quote.packaging.some((x) => x.item_id === c.item_id)).map((c) => <option key={c.item_id} value={c.item_id}>{c.name}{c.price ? ` (${money(c.price)})` : ''}</option>)}
                  </select>
                  {l.removed && <input aria-label={`Why no ${l.name}`} placeholder="Why? (optional)" maxLength={200} defaultValue={l.reason ?? ''} onBlur={(e) => setReason(l, e.target.value)} style={{ flex: 1, minWidth: 140, padding: 6, borderRadius: 8, fontSize: '0.8rem', ...line }} />}
                  {l.source !== 'rule' && <small style={{ color: '#64748b' }}>{l.source === 'added' ? 'added' : 'swapped'}</small>}
                </div>
              </div>
            ))}
            {quote.packaging_choices.filter((c) => !quote.packaging.some((x) => x.item_id === c.item_id)).length > 0 && (
              <select aria-label="Add packaging" value="" onChange={(e) => addItem(Number(e.target.value))} style={{ padding: 8, borderRadius: 8, ...line }}>
                <option value="">Add packaging…</option>
                {quote.packaging_choices.filter((c) => !quote.packaging.some((x) => x.item_id === c.item_id)).map((c) => <option key={c.item_id} value={c.item_id}>{c.name}{c.price ? ` (${money(c.price)})` : ' (free)'}</option>)}
              </select>
            )}
            {quote.packaging_waiver?.amount > 0 && (
              <p role={quote.packaging_waiver.allowed ? 'status' : 'alert'} data-testid="packaging-waiver" style={{ margin: 0, fontSize: '0.8rem', color: quote.packaging_waiver.allowed ? '#b45309' : '#b91c1c' }}>
                {quote.packaging_waiver.allowed ? `You are waiving ${money(quote.packaging_waiver.amount)} of packaging that is compulsory (${quote.packaging_waiver.items.join(', ')}). It is logged.` : `${quote.packaging_waiver.items.join(', ')} is compulsory and has a price: only someone who may waive packaging can take it off or reduce it. Put it back, or ask a manager.`}
              </p>
            )}
            <small style={{ color: '#64748b' }}>Prices come from the packaging price list. What is charged is part of the bill, and every item goes off the shelf when it is paid.</small>
          </div>
        )}
        {quote?.condiments?.length > 0 && (
          <div data-testid="condiment-list" style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--line, #cbd5e1)', paddingTop: 8 }}>
            <strong style={{ fontSize: '0.85rem' }}>Free condiments</strong>
            {quote.condiments.map((c) => (
              <div key={c.ingredient_id} data-testid="condiment-line" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 120 }}>{c.name}<small style={{ color: '#64748b' }}> {c.allowed} allowed</small></span>
                <button type="button" aria-label={`Fewer ${c.name}`} disabled={c.given < 1} onClick={() => setGiven((g) => ({ ...g, [c.ingredient_id]: c.given - 1 }))} style={{ ...line, width: 32, height: 32, borderRadius: 8, cursor: 'pointer' }}>−</button>
                <strong aria-label={`${c.name} given`} style={{ minWidth: 22, textAlign: 'center' }}>{c.given}</strong>
                <button type="button" aria-label={`More ${c.name}`} onClick={() => setGiven((g) => ({ ...g, [c.ingredient_id]: c.given + 1 }))} style={{ ...line, width: 32, height: 32, borderRadius: 8, cursor: 'pointer' }}>+</button>
                {c.warning && <small role="status" style={{ flexBasis: '100%', color: '#b45309' }}>{c.warning} It is allowed; it is only a warning.</small>}
              </div>
            ))}
          </div>
        )}
        {problem && <p role="alert" style={{ margin: 0, color: '#b91c1c' }}>{problem}</p>}
        {rules.service_charge_on && service === 'dine_in' && <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} /> Waive the {rules.service_charge_pct}% service charge</label>}
        {rules.tips_on && <label style={{ display: 'grid', gap: 4, fontSize: '0.8rem', fontWeight: 700 }}>Tip<input type="number" min="0" step="any" inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} style={{ padding: 10, borderRadius: 8, ...line }} /></label>}
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8 }}>
            <select aria-label={`Paid by ${i + 1}`} value={r.payment_method_id} onChange={(e) => set(i, { payment_method_id: e.target.value })} style={{ padding: 10, borderRadius: 8, ...line }}>{data.payment_methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <input aria-label={`Amount ${i + 1}`} type="number" min="0" step="any" inputMode="decimal" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} style={{ padding: 10, borderRadius: 8, ...line }} />
            {method(r)?.kind !== 'cash' && <input aria-label={`Reference ${i + 1}`} placeholder="Code or reference" value={r.reference} onChange={(e) => set(i, { reference: e.target.value })} style={{ gridColumn: '1 / -1', padding: 10, borderRadius: 8, ...line }} />}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={{ ...big('transparent', 'inherit'), ...line, padding: '8px 12px' }} onClick={() => set(rows.length - 1, { amount: String(Math.max(0, due - rows.slice(0, -1).reduce((n, r) => n + (Number(r.amount) || 0), 0)).toFixed(2)) })}>Exact</button>
          {[100, 500, 1000, 2000].map((n) => <button key={n} type="button" style={{ ...big('transparent', 'inherit'), ...line, padding: '8px 12px' }} onClick={() => set(rows.length - 1, { amount: String(n) })}>{n}</button>)}
          <button type="button" style={{ ...big('transparent', 'inherit'), ...line, padding: '8px 12px' }} onClick={() => setRows((xs) => [...xs, { payment_method_id: String(data.payment_methods.find((m) => m.kind !== 'cash')?.id ?? data.payment_methods[0]?.id ?? ''), amount: '', reference: '' }])}>Split</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
          {short > 0.004 ? <span style={{ color: '#b91c1c' }} data-testid="short">Still to pay {money(short)}</span> : <span style={{ color: '#047857' }} data-testid="change">Change {money(change)}</span>}
          <span>Handed over {money(handed)}</span>
        </div>
      </div>
    </Modal>
  );
}

function ReceiptModal({ order, onClose }) {
  const [r, setR] = useState(null);
  const [width, setWidth] = useState(32);
  useEffect(() => { menusAPI.receipt(order.id, width).then(setR).catch((e) => toast.error(errMsg(e, 'Could not make the receipt'))); }, [order.id, width]);

  return (
    <Modal title={`Receipt · #${order.short_no ?? order.number}`} onClose={onClose} width={440}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
        <select aria-label="Paper" value={width} onChange={(e) => setWidth(Number(e.target.value))} style={{ padding: 10, borderRadius: 8, ...line }}><option value={32}>58 mm</option><option value={42}>80 mm</option></select>
        <div style={{ display: 'flex', gap: 8 }}><button type="button" style={{ ...big('#0f172a') }} disabled={!r} onClick={() => printReceipt(r.text, r.width)}><Printer size={16} aria-hidden="true" /> Print</button><button type="button" style={{ ...big('transparent', 'inherit'), ...line }} onClick={onClose}>Done</button></div></div>}>
      <pre data-testid="receipt" style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.8rem', background: '#fff', color: '#111', padding: 12, borderRadius: 8, overflow: 'auto' }}>{r ? r.text : 'Making the receipt…'}</pre>
    </Modal>
  );
}

/** Menus → Till: the cashier's screen. Ring up dishes (with choices), then take the money, or open a tab that is ordered in rounds and paid at the end. Paid orders wait on the right until the kitchen has made them. */
export default function MenusTill() {
  const user = useAuthStore((s) => s.user);
  const canAct = canRunFoodTill(user);
  const [data, setData] = useState(null);
  const basket = useBasket(null);
  const [menuId, setMenuId] = useState(null);
  const [picking, setPicking] = useState(null);
  const [service, setService] = useState('take_out');
  const [label, setLabel] = useState('');
  const [tabId, setTabId] = useState(null);
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  const [tableId, setTableId] = useState(params.get('table') ?? '');
  const [splitIds, setSplitIds] = useState([]);
  const [kioskPay, setKioskPay] = useState(null);

  const load = useCallback(() => menusAPI.till().then((r) => { setData(r); setMenuId((m) => m ?? (r.menu.menus.find((x) => x.serving_now) ?? r.menu.menus[0])?.id ?? null); }).catch((e) => toast.error(errMsg(e, 'Could not load the till'))), []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const tab = data?.tabs.find((t) => t.id === tabId) ?? null;
  const menu = data?.menu.menus.find((m) => m.id === menuId);
  const payload = useMemo(() => ({ service: tab?.service ?? (tableId ? 'dine_in' : service), label: label || undefined, table_id: tableId ? Number(tableId) : undefined, items: items(basket) }), [tab, service, label, tableId, basket.lines]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = Number(params.get('tab')); if (t && data?.tabs.some((x) => x.id === t)) { setTabId(t); setParams({}, { replace: true }); } }, [data]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!basket.lines.length || tab) { setQuote(null); return undefined; }
    let live = true;
    const t = setTimeout(() => { menusAPI.tillQuote(payload).then((q) => { if (live) setQuote(q); }).catch(() => { if (live) setQuote(null); }); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [payload, tab, basket.lines.length]);

  const add = (d) => (needsChoice(d) ? setPicking(d) : basket.add(d));
  const run = async (fn, ok) => {
    setBusy(true);
    try { const r = await fn(); if (ok) toast.success(ok); await load(); return r; } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); return null; } finally { setBusy(false); }
  };
  const reset = () => { basket.clear(); setLabel(''); setTabId(null); setTableId(''); setSplitIds([]); setQuote(null); };

  const pay = async (extra) => {
    const r = tab ? await menusAPI.settleTab(tab.id, { ...extra }) : await menusAPI.sell({ ...payload, ...extra });
    setPaying(false); reset(); await load(); setReceipt(r.order);
  };
  const sendRound = () => run(async () => { const r = tab ? await menusAPI.addToTab(tab.id, { items: items(basket) }) : await menusAPI.openTab(payload); basket.clear(); if (!tab) { setLabel(''); setTableId(''); setTabId(r.order.id); } return r; }, tab ? 'Sent to the kitchen.' : 'Tab opened and sent to the kitchen.');
  const handOver = (o) => run(() => menusAPI.setOrderStatus(o.id, 'completed'), `#${o.short_no} handed over.`);
  const cancelTab = () => { const reason = window.prompt(`Cancel the tab ${tab.label}? Say why:`, ''); if (reason === null) return null; return run(async () => { await menusAPI.cancelTab(tab.id, reason || undefined); reset(); }, 'Tab cancelled.'); };

  if (!canViewMenus(user) && !canRunFoodTill(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the till" /></div></AdminLayout>;
  const food = basket.subtotal;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1500, margin: '0 auto' }} data-testid="menus-till">
        <HubHeader title="Till" description="Ring up a sale and take the money, or open a tab for a table." />
        {data && !data.on && <p role="status" style={{ color: colors.textMuted }}>The counter is switched off. Switch it on under Menus → Configuration → Ways to order (run database script 138_menus_counter.sql first if it is not listed).</p>}
        {data?.on && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 18, alignItems: 'start' }}>
            <section aria-label="Menu">
              <div role="tablist" aria-label="Menus" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {data.menu.menus.map((m) => <button key={m.id} type="button" role="tab" aria-selected={m.id === menuId} onClick={() => setMenuId(m.id)} style={{ ...big(m.id === menuId ? '#0f172a' : 'transparent', m.id === menuId ? '#fff' : 'inherit'), ...line }}>{m.name}{m.serving_now ? '' : ' · later'}</button>)}
              </div>
              {data.menu.menus.length === 0 && (
                <div role="status" data-testid="till-empty" style={{ padding: 16, borderRadius: 12, border: '1.5px dashed var(--line, #cbd5e1)', display: 'grid', gap: 6, fontSize: '0.9rem' }}>
                  <strong>There are no dishes to sell here yet.</strong>
                  <span>A dish shows on the till once it is switched on, sits in a section of a menu that is switched on, and that menu is allowed on the counter (Menus, Configuration, Ways to order). Sizes, sides, leave out and add, packaging and condiments appear when you pick such a dish.</span>
                  <span><Link to="/admin/menus/menus">Open the menus</Link> · <Link to="/admin/menus/dishes">Open the dishes</Link></span>
                </div>
              )}
              {menu && !menu.serving_now && <p role="status" style={{ color: '#b45309' }}>{menu.name} is not being served right now ({menu.serves}).</p>}
              {menu?.sections.map((s) => (
                <div key={s.id} style={{ marginBottom: 16 }}>
                  <h2 style={{ margin: '0 0 8px', fontSize: '0.95rem', fontWeight: 800 }}>{s.name}</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                    {s.dishes.map((d) => (
                      <button key={d.id} type="button" data-dish={d.name} disabled={!canAct || !d.available || !menu.serving_now || d.price == null} onClick={() => add(d)}
                        style={{ ...line, minHeight: 78, padding: 10, borderRadius: 12, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'grid', alignContent: 'space-between', opacity: d.available && menu.serving_now ? 1 : 0.45 }}>
                        <strong style={{ fontSize: '0.92rem' }}>{d.name}</strong>
                        <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>{d.available ? `${shownPrice(d).from ? 'from ' : ''}${money(d.makeup?.servings?.length ? Math.min(...d.makeup.servings.map((s) => s.price)) : d.price)}` : 'Sold out'}{needsChoice(d) ? ' · choices' : ''}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <aside aria-label="Order" style={{ display: 'grid', gap: 14 }}>
              <div style={{ border: '2px solid var(--line, #cbd5e1)', borderRadius: 14, padding: 14, display: 'grid', gap: 10 }}>
                {tab ? (
                  <div data-testid="tab-open">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong>Tab · {tab.label}</strong><button type="button" aria-label="Leave the tab" style={{ ...line, borderRadius: 8, cursor: 'pointer' }} onClick={() => { setTabId(null); basket.clear(); }}><X size={16} /></button></div>
                    <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 4, fontSize: '0.86rem' }}>
                      {tab.lines_full.map((l) => (
                        <li key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <input type="checkbox" aria-label={`Split off ${l.name}`} checked={splitIds.includes(l.id)} onChange={(e) => setSplitIds((xs) => (e.target.checked ? [...xs, l.id] : xs.filter((x) => x !== l.id)))} />
                          <span style={{ flex: 1 }}>{l.quantity} × {l.name}{l.options.length > 0 && <small style={{ color: colors.textMuted }}> · {l.options.join(', ')}</small>} <small style={{ color: colors.textMuted }}>(round {l.round})</small><LineMakeup line={l} color={colors.textMuted} />
                            {(l.extras ?? []).filter((x) => x.left !== 0).length > 0 && (
                              <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                {l.extras.filter((x) => x.left !== 0).map((x) => (
                                  <button key={x.side_id} type="button" disabled={busy} aria-label={`Add ${x.name} to ${l.name}`} onClick={() => run(() => menusAPI.addExtra(tab.id, { line_id: l.id, side_id: x.side_id, quantity: 1 }), 'Sent to the kitchen.')} style={{ ...line, borderRadius: 999, padding: '2px 10px', cursor: 'pointer', fontSize: '0.78rem' }}>+ {x.name} {money(x.price)}</button>
                                ))}
                              </span>
                            )}
                          </span>
                          <button type="button" aria-label={`Take ${l.name} off`} disabled={busy} onClick={() => run(() => menusAPI.voidLine(tab.id, l.id), 'Taken off the tab.')} style={{ ...line, borderRadius: 6, cursor: 'pointer' }}><X size={12} /></button>
                        </li>
                      ))}
                    </ul>
                    {splitIds.length > 0 && <button type="button" disabled={busy} style={{ ...big('#6366f1'), marginTop: 8, padding: '8px 12px' }} onClick={() => run(async () => { const r = await menusAPI.splitTab(tab.id, splitIds); setSplitIds([]); setTabId(r.order.id); return r; }, 'The chosen dishes are on a new bill.')}>Split {splitIds.length} onto a new bill</button>}
                    {tab.table_id && data.tables && (
                      <select aria-label="Move the tab to" value="" onChange={(e) => e.target.value && run(() => menusAPI.moveTab(tab.id, Number(e.target.value)), 'Moved.')} style={{ marginTop: 8, padding: 8, borderRadius: 8, ...line, width: '100%' }}>
                        <option value="">Move the tab to another table…</option>
                        {data.tables.filter((t) => !t.tab_id && ['free', 'seated', 'reserved'].includes(t.state) && t.id !== tab.table_id).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.area})</option>)}
                      </select>
                    )}
                    <div style={{ marginTop: 6, fontWeight: 800 }}>So far {money(tab.total)} <small style={{ fontWeight: 500, color: colors.textMuted }}>(with tax; service charge and tip are added when it is paid)</small></div>
                  </div>
                ) : (
                  <>
                    <div role="group" aria-label="Service" style={{ display: 'flex', gap: 8 }}>
                      {Object.entries(data.services).map(([k, name]) => <button key={k} type="button" aria-pressed={service === k} onClick={() => setService(k)} style={{ ...big(service === k ? '#0f172a' : 'transparent', service === k ? '#fff' : 'inherit'), ...line, flex: 1 }}>{name}</button>)}
                    </div>
                    {data.tables && data.tables.length > 0 && (
                      <select aria-label="Table" value={tableId} onChange={(e) => { setTableId(e.target.value); if (e.target.value) setService('dine_in'); }} style={{ padding: 10, borderRadius: 8, ...line }}>
                        <option value="">No table (counter)</option>
                        {data.tables.filter((t) => !t.tab_id && ['free', 'seated', 'reserved'].includes(t.state)).map((t) => <option key={t.id} value={t.id}>{t.name} · {t.area} · {t.seats} seats</option>)}
                      </select>
                    )}
                    <input aria-label="Name or table" placeholder="Name or table (needed for a tab)" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} style={{ padding: 10, borderRadius: 8, ...line }} />
                  </>
                )}
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }} data-testid="basket">
                  {basket.lines.length === 0 && <li style={{ color: colors.textMuted, fontSize: '0.86rem' }}>{tab ? 'Add more dishes to the tab.' : 'Tap a dish to start.'}</li>}
                  {basket.lines.map((l) => (
                    <li key={l.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, fontSize: '0.9rem' }}>
                      <span><strong>{l.name}</strong>{l.option_names.length > 0 && <small style={{ color: colors.textMuted }}> · {l.option_names.join(', ')}</small>}{l.note && <small style={{ color: '#b45309' }}> · “{l.note}”</small>}</span>
                      <span>{money(lineTotal(l))}</span>
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <button type="button" aria-label={`Fewer ${l.name}`} onClick={() => basket.setQuantity(l.key, l.quantity - 1)} style={{ ...line, borderRadius: 6, cursor: 'pointer' }}><Minus size={14} /></button>
                        <b>{l.quantity}</b>
                        <button type="button" aria-label={`More ${l.name}`} onClick={() => basket.setQuantity(l.key, l.quantity + 1)} style={{ ...line, borderRadius: 6, cursor: 'pointer' }}><Plus size={14} /></button>
                      </span>
                    </li>
                  ))}
                </ul>
                {!tab && basket.lines.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1.1rem' }}><span>Total</span><span data-testid="total">{quote ? money(quote.total) : `${money(food)} + tax`}</span></div>
                )}
                {canAct && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {tab ? (
                      <>
                        {basket.lines.length > 0 && <button type="button" disabled={busy} style={big('#d97706')} onClick={sendRound}>Send to the kitchen</button>}
                        <button type="button" disabled={busy || basket.lines.length > 0} style={{ ...big('#059669'), opacity: basket.lines.length ? 0.5 : 1 }} onClick={() => setPaying(true)}>Pay the tab</button>
                        <button type="button" style={{ ...big('transparent', '#b91c1c'), border: '1.5px solid #fca5a5' }} onClick={cancelTab}>Cancel the tab</button>
                      </>
                    ) : (
                      <>
                        <button type="button" disabled={busy || !basket.lines.length} style={{ ...big('#059669'), opacity: basket.lines.length ? 1 : 0.5 }} onClick={() => setPaying(true)}>Pay</button>
                        <button type="button" disabled={busy || !basket.lines.length || (!label.trim() && !tableId)} style={{ ...big('#d97706'), opacity: basket.lines.length && (label.trim() || tableId) ? 1 : 0.5 }} onClick={sendRound}>Open a tab</button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div style={{ border: '1.5px solid var(--line, #cbd5e1)', borderRadius: 14, padding: 12 }} data-testid="tabs">
                <h2 style={{ margin: '0 0 8px', fontSize: '0.9rem', fontWeight: 800 }}>Open tabs · {data.tabs.length}</h2>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {data.tabs.length === 0 && <span style={{ color: colors.textMuted, fontSize: '0.82rem' }}>None.</span>}
                  {data.tabs.map((t) => <button key={t.id} type="button" data-tab={t.label} aria-pressed={t.id === tabId} onClick={() => { setTabId(t.id); basket.clear(); }} style={{ ...big(t.id === tabId ? '#0f172a' : 'transparent', t.id === tabId ? '#fff' : 'inherit'), ...line, padding: '8px 12px' }}>{t.label} · {money(t.total)}</button>)}
                </div>
              </div>

              {!(data.kiosk?.length > 0) && <p data-testid="kiosk-hint" style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Kiosk orders that guests pay for at the counter show up here. The kiosk screens themselves are set up under <Link to="/admin/menus/settings">Menus, Configuration, Kiosks</Link>.</p>}

                      {data.kiosk?.length > 0 && (
                <div style={{ border: '2px solid #f59e0b', borderRadius: 14, padding: 12 }} data-testid="kiosk-orders">
                  <h2 style={{ margin: '0 0 8px', fontSize: '0.9rem', fontWeight: 800 }}>Kiosk orders to pay · {data.kiosk.length}</h2>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                    {data.kiosk.map((o) => (
                      <li key={o.id} data-kiosk={o.short_no} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontSize: '1.3rem', minWidth: 44 }}>#{o.short_no}</strong>
                        <span style={{ flex: 1, fontSize: '0.78rem', color: colors.textMuted }}>{o.lines.map((l) => `${l.quantity} × ${l.name}`).join(', ')}<br />{money(o.total)} · {o.session_code}</span>
                        {canAct && <button type="button" disabled={busy} onClick={() => setKioskPay(o)} style={{ ...big('#059669'), padding: '6px 12px', fontSize: '0.8rem' }}>Take payment</button>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ border: '1.5px solid var(--line, #cbd5e1)', borderRadius: 14, padding: 12 }} data-testid="handover">
                <h2 style={{ margin: '0 0 8px', fontSize: '0.9rem', fontWeight: 800 }}>To hand over · {data.ready.length}</h2>
                {data.ready.length === 0 && <span style={{ color: colors.textMuted, fontSize: '0.82rem' }}>Nothing waiting.</span>}
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                  {data.ready.map((o) => (
                    <li key={o.id} data-order={o.short_no} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: '1.2rem', minWidth: 44 }}>#{o.short_no}</strong>
                      <span style={{ flex: 1, fontSize: '0.8rem', color: o.status === 'ready' ? '#047857' : colors.textMuted, fontWeight: 700 }}>{o.status === 'ready' ? 'READY' : 'being made'}</span>
                      <button type="button" aria-label={`Receipt for ${o.short_no}`} onClick={() => setReceipt(o)} style={{ ...line, borderRadius: 8, padding: 6, cursor: 'pointer' }}><Receipt size={14} /></button>
                      {canAct && <button type="button" disabled={busy || o.status !== 'ready'} onClick={() => handOver(o)} style={{ ...big('#059669'), padding: '6px 12px', fontSize: '0.8rem', opacity: o.status === 'ready' ? 1 : 0.4 }}>Handed over</button>}
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        )}
      </div>
      {picking && <DishPicker dish={picking} onClose={() => setPicking(null)} onAdd={(d, o) => { basket.add(d, o); setPicking(null); }} />}
      {paying && data && (
        <PayModal data={data} rules={data.rules} service={tab?.service ?? service} total={tab ? tab.total : quote?.total ?? 0} onClose={() => setPaying(false)} onPay={pay}
          quote={(extra) => (tab ? menusAPI.quoteTab(tab.id, extra) : menusAPI.tillQuote({ ...payload, ...extra }))} />
      )}
      {kioskPay && data && (
        <PayModal data={data} rules={{ ...data.rules, tips_on: false, service_charge_on: false }} service={kioskPay.service} total={kioskPay.total} onClose={() => setKioskPay(null)}
          quote={(extra) => menusAPI.quoteKiosk(kioskPay.id, extra)}
          onPay={async (extra) => { const r = await menusAPI.settleKiosk(kioskPay.id, { tenders: extra.tenders, ...(extra.packaging ? { packaging: extra.packaging } : {}), ...(extra.condiments ? { condiments: extra.condiments } : {}) }); setKioskPay(null); await load(); setReceipt(r.order); }} />
      )}
      {receipt && <ReceiptModal order={receipt} onClose={() => setReceipt(null)} />}
    </AdminLayout>
  );
}
