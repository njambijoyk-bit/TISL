import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Minus, Plus, Trash2, Pause, Play, X, Search, ScanLine, Lock, LifeBuoy } from 'lucide-react';
import { Link } from 'react-router-dom';
import posAPI from '../../../../_shared/api/pos';
import { PAPER, printReceipt } from './printReceipt';
import { OpenShiftDialog, ShiftDialog, ShiftList } from './ShiftDialogs';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';

const money = (n, cur) => `${cur?.symbol ?? ''} ${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 60);
const field = { padding: '9px 11px', borderRadius: 8, border: '1.5px solid var(--line)', fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' };

/** Pay: one or several tenders, change due. Cash may be more than owed; other ways must match. */
function PayDialog({ total, methods, cur, busy, mode, customer, onCancel, onPay }) {
  const cash = methods.find((m) => m.kind === 'cash') ?? methods[0];
  const later = mode !== 'cash';   // an invoice or an order: paying something now is optional
  const [rows, setRows] = useState([{ payment_method_id: cash?.id ?? '', amount: later ? '' : String(total), reference: '' }]);
  const handed = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const change = Math.round((handed - total) * 100) / 100;
  const set = (i, patch) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const left = Math.max(0, Math.round((total - handed) * 100) / 100);

  return (
    <div role="dialog" aria-label="Payment" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ ...card, padding: 20, width: 'min(480px, 100%)', display: 'grid', gap: 12 }}>
        <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>{mode === 'invoice' ? `Invoice for ${customer?.name}` : mode === 'order' ? `Sales order for ${customer?.name}` : 'Amount due'}</div>
        <div style={{ fontSize: '2rem', fontWeight: 800 }}>{money(total, cur)}</div>
        {later && <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>{mode === 'invoice' ? 'The rest goes on their account. Take a part payment now if they are paying some.' : 'Take a deposit now if they are leaving one. Leave it blank for none.'}</div>}
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto', gap: 8, alignItems: 'start' }}>
            <select style={field} value={r.payment_method_id} onChange={(e) => set(i, { payment_method_id: Number(e.target.value) })} aria-label="Way of paying">
              {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input style={field} inputMode="decimal" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} aria-label="Amount" />
            {rows.length > 1 ? <button type="button" style={btnGhost} aria-label="Remove" onClick={() => setRows(rows.filter((_, k) => k !== i))}><X size={14} /></button> : <span />}
            {methods.find((m) => m.id === r.payment_method_id)?.kind !== 'cash' && (
              <input style={{ ...field, gridColumn: '1 / -1' }} placeholder="Reference (transaction code)" value={r.reference} onChange={(e) => set(i, { reference: e.target.value })} aria-label="Reference" />
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={{ ...btnGhost, display: later ? 'none' : undefined }} onClick={() => left > 0 && setRows([...rows, { payment_method_id: methods.find((m) => m.id !== rows[0].payment_method_id)?.id ?? cash?.id, amount: String(left), reference: '' }])}>Split payment</button>
          {[50, 100, 500, 1000].map((n) => <button key={n} type="button" style={btnGhost} onClick={() => set(0, { amount: String((Number(rows[0].amount) || 0) + n) })}>+{n}</button>)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>{later ? (mode === 'invoice' ? 'Left on account' : 'Balance of the order') : (change >= 0 ? 'Change due' : 'Still to pay')}</span>
          <span style={{ color: later || change >= 0 ? colors.primary : colors.danger }}>{money(later ? Math.max(0, total - handed) : Math.abs(change), cur)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={btnGhost} disabled={busy} onClick={onCancel}>Back</button>
          <button type="button" style={btnPrimary} disabled={busy || (later ? handed > total + 0.004 : change < 0)} onClick={() => onPay(rows.map((r) => ({ ...r, amount: Number(r.amount) || 0 })))}>{busy ? 'Posting…' : ({ cash: 'Complete sale', invoice: 'Post invoice', order: 'Place order' })[mode]}</button>
        </div>
      </div>
    </div>
  );
}


/** A supervisor approves: name and their own PIN. The approval is for one thing, lasts five minutes and is used once. */
function ApproveDialog({ purpose, stationId, why, onDone, onCancel }) {
  const [list, setList] = useState(null);
  const [who, setWho] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { posAPI.supervisors(stationId).then((r) => { setList(r.supervisors); setWho(r.supervisors[0]?.id ?? ''); }).catch((e) => { toast.error(errMsg(e, 'Could not load supervisors')); onCancel(); }); }, [stationId, onCancel]);
  const go = async () => {
    setBusy(true);
    try { const r = await posAPI.approve({ supervisor_id: Number(who), pin, purpose, station_id: stationId }); onDone(r); } catch (e) { toast.error(errMsg(e, 'Not approved')); setPin(''); } finally { setBusy(false); }
  };

  return (
    <div role="dialog" aria-label="Supervisor approval" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ ...card, padding: 20, width: 'min(380px, 100%)', display: 'grid', gap: 10 }}>
        <strong>Supervisor approval</strong>
        <div style={{ fontSize: '0.82rem', color: colors.textMuted }}>{why}</div>
        {list && list.length === 0 && <p style={{ margin: 0, color: colors.danger, fontSize: '0.85rem' }}>No supervisor with a PIN is set up for this branch. A supervisor sets theirs from the till (My PIN).</p>}
        {list && list.length > 0 && (
          <>
            <select style={field} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Supervisor">{list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <input style={field} type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && pin.length === 6 && go()} placeholder="Their 6-digit PIN" aria-label="PIN" />
          </>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={btnGhost} onClick={onCancel}>Cancel</button>
          <button type="button" style={btnPrimary} disabled={busy || pin.length !== 6 || !who} onClick={go}>{busy ? 'Checking…' : 'Approve'}</button>
        </div>
      </div>
    </div>
  );
}

/** A supervisor sets their own PIN. */
function PinDialog({ onClose }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const save = async () => {
    try { const r = await posAPI.setPin(a); toast.success(r.message); onClose(true); } catch (e) { toast.error(errMsg(e, 'Could not save the PIN')); }
  };

  return (
    <div role="dialog" aria-label="My PIN" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ ...card, padding: 20, width: 'min(340px, 100%)', display: 'grid', gap: 10 }}>
        <strong>My supervisor PIN</strong>
        <input style={field} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ''))} placeholder="New 6-digit PIN" aria-label="New PIN" />
        <input style={field} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ''))} placeholder="Type it again" aria-label="Repeat PIN" />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={btnGhost} onClick={() => onClose(false)}>Cancel</button>
          <button type="button" style={btnPrimary} disabled={a.length !== 6 || a !== b} onClick={save}>Save PIN</button>
        </div>
      </div>
    </div>
  );
}

/** Take items back against a sale or invoice. A supervisor's PIN completes it, however small. */
function ReturnPanel({ ctx, cur, onDone }) {
  const [number, setNumber] = useState('');
  const [doc, setDoc] = useState(null);
  const [qty, setQty] = useState({});
  const [reason, setReason] = useState('');
  const [ledger, setLedger] = useState('');
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  const find = async () => {
    try {
      const r = await posAPI.findReturn(number); setDoc(r); setQty({}); setLedger(r.refund?.default_id ?? r.refund?.ledgers?.[0]?.id ?? '');
      if (r.lines.length === 0) toast('Nothing on that document can be taken back (it may be fully returned already).');
    } catch (e) { setDoc(null); toast.error(errMsg(e, 'Not found')); }
  };
  const lines = doc ? doc.lines.filter((l) => Number(qty[l.id]) > 0).map((l) => ({ item_id: l.id, quantity: Number(qty[l.id]) })) : [];
  const worth = doc ? doc.lines.reduce((a, l) => a + (l.available_quantity > 0 ? (Number(qty[l.id]) || 0) * (l.available_amount / l.available_quantity) : 0), 0) : 0;
  const submit = async (approval) => {
    setBusy(true);
    try {
      const r = await posAPI.makeReturn({ station_id: ctx.station.id, voucher_id: doc.source.id, lines, reason, refund_ledger_id: ledger || undefined, approval_token: approval.token });
      onDone(r);
    } catch (e) { toast.error(errMsg(e, 'The return did not post'), { duration: 9000 }); } finally { setBusy(false); setAsk(false); }
  };

  return (
    <section style={{ ...card, padding: 16, display: 'grid', gap: 10, maxWidth: 720 }}>
      <strong>Return items</strong>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={field} value={number} onChange={(e) => setNumber(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()} placeholder="Receipt or invoice number (type it or scan the receipt)" aria-label="Receipt number" />
        <button type="button" style={btnPrimary} onClick={find} disabled={!number.trim()}>Find</button>
      </div>
      {doc && (
        <>
          <div style={{ fontSize: '0.85rem', color: colors.textMuted }}>{doc.source.type} {doc.source.voucher_number} · {doc.source.date}{doc.source.party ? ` · ${doc.source.party}` : ''} · {money(doc.source.total, cur)}</div>
          {doc.lines.map((l) => (
            <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', paddingBottom: 6, borderBottom: '1px solid var(--line)' }}>
              <div><div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{l.description}</div><div style={{ fontSize: '0.75rem', color: colors.textMuted }}>sold {l.quantity} · can take back {l.available_quantity}</div></div>
              <input style={{ ...field, width: 90, textAlign: 'center' }} inputMode="decimal" placeholder="0" value={qty[l.id] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [l.id]: Math.min(Number(e.target.value) || 0, l.available_quantity) || '' }))} aria-label={`Quantity of ${l.description} to take back`} />
            </div>
          ))}
          <input style={field} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Why is it coming back?" aria-label="Reason" />
          {doc.paid_at_once && doc.refund?.ledgers?.length > 0 && (
            <label style={{ fontSize: '0.8rem', color: colors.textMuted, display: 'grid', gap: 4 }}>Money goes back from
              <select style={field} value={ledger} onChange={(e) => setLedger(Number(e.target.value))}>{doc.refund.ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            </label>
          )}
          {!doc.paid_at_once && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>This invoice is on account: the credit note lowers what the customer owes. No cash is paid out.</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 800 }}>About {money(worth, cur)} (the books work out the exact tax)</span>
            <button type="button" style={btnPrimary} disabled={busy || lines.length === 0 || !reason.trim()} onClick={() => setAsk(true)}>Take back — needs supervisor</button>
          </div>
        </>
      )}
      {ask && <ApproveDialog purpose="return" stationId={ctx.station.id} why="Every return needs a supervisor's PIN." onCancel={() => setAsk(false)} onDone={submit} />}
    </section>
  );
}

/** The till fills the whole page: no admin menu around it. */
function Shell({ children }) {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-secondary, #f9fafb)', padding: 16, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Link to="/admin" style={{ fontSize: '0.78rem', color: colors.textMuted, textDecoration: 'none' }}>← Back to admin</Link>
      </div>
      {children}
    </main>
  );
}

/** Point of sale: search or scan, a basket, hold and recall, pay and post a cash sale. */
export default function PosTill() {
  const [ctx, setCtx] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [cart, setCart] = useState([]);   // { variant_id, name, quantity, discount_pct, price }
  const [priced, setPriced] = useState(null);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [holds, setHolds] = useState(null);
  const [mode, setMode] = useState('cash');
  const [approval, setApproval] = useState(null);   // a supervisor's approval for a discount: { token, supervisor }
  const [ask, setAsk] = useState(null);             // { purpose, why, then }
  const [pinOpen, setPinOpen] = useState(false);
  const [returned, setReturned] = useState(null);
  const [paper, setPaper] = useState('');
  const [auto, setAuto] = useState(() => { try { return localStorage.getItem('pos.autoprint') === '1'; } catch { return false; } });
  const [mine, setMine] = useState(null);
  const [locked, setLocked] = useState(true);   // the touch-to-start screen
  const [helpList, setHelpList] = useState(null);   // open requests from self-checkout screens
  const [helpDlg, setHelpDlg] = useState(false);
  const [shiftUi, setShiftUi] = useState(null);   // 'open' | 'list' | { id }
  const [customer, setCustomer] = useState(null);
  const [cq, setCq] = useState('');
  const [cfound, setCfound] = useState([]);
  const key = useRef(newKey());
  const search = useRef(null);

  const loadCtx = useCallback((stationId) => posAPI.context(stationId).then(setCtx).catch((e) => setError(errMsg(e, 'Could not open the point of sale'))), []);
  useEffect(() => { loadCtx(); }, [loadCtx]);
  useEffect(() => { search.current?.focus(); }, [ctx, done, locked]);
  useEffect(() => {   // customers who pressed Call for help at a self-checkout screen
    if (!ctx?.station) return undefined;
    let live = true;
    const load = () => posAPI.helpRequests().then((r) => live && setHelpList(r.requests)).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { live = false; clearInterval(t); };
  }, [ctx?.station?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {   // search as they type
    const t = setTimeout(() => { if (ctx?.ready !== false) posAPI.catalogue(q, ctx?.station?.id).then((r) => setFound(r.items)).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [q, ctx]);

  const body = useCallback(() => ({ station_id: ctx?.station?.id, mode, approval_token: approval?.token, customer_id: mode === 'cash' ? undefined : customer?.id, items: cart.map((c) => ({ variant_id: c.variant_id, quantity: c.quantity, discount_pct: c.discount_pct || 0 })) }), [ctx, cart, mode, customer, approval]);
  useEffect(() => {   // the books price the basket: the total shown is the one that will post
    if (!cart.length || !ctx?.station) { setPriced(null); return undefined; }
    let live = true;
    const t = setTimeout(() => { posAPI.price(body()).then((r) => live && setPriced(r)).catch((e) => { if (!live) return; if (e?.response?.data?.approval === 'discount') { setApproval(null); setAsk({ purpose: 'discount', why: e.response.data.message, then: (a) => setApproval(a) }); } else toast.error(errMsg(e, 'Could not price the basket')); }); }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [cart, ctx, body]);

  useEffect(() => {
    if (mode === 'cash' || customer || cq.trim().length < 2) { setCfound([]); return undefined; }
    const t = setTimeout(() => { posAPI.customers(cq).then((r) => setCfound(r.customers)).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [cq, mode, customer]);

  const add = (it) => {
    if (!(it.price > 0)) { toast.error(`${it.name} has NO PRICE and can not be sold. Ask a manager to set its price.`, { duration: 9000 }); return; }
    if (it.stock != null && it.stock <= 0) { toast.error(`${it.name} is out of stock.`); return; }
    const inCart = cart.find((x) => x.variant_id === it.variant_id)?.quantity ?? 0;
    if (it.stock != null && inCart + 1 > it.stock) { toast.error(`Only ${it.stock} of ${it.name} in stock.`); return; }
    setCart((c) => (c.some((x) => x.variant_id === it.variant_id) ? c.map((x) => (x.variant_id === it.variant_id ? { ...x, quantity: x.quantity + 1 } : x)) : [...c, { variant_id: it.variant_id, name: it.name, quantity: 1, discount_pct: 0, price: it.price, stock: it.stock }]));
  };
  const change = (id, patch) => setCart((c) => c.map((x) => {
    if (x.variant_id !== id) return x;
    const next = { ...x, ...patch };
    if (x.stock != null && next.quantity > x.stock) { toast.error(`Only ${x.stock} of ${x.name} in stock.`); next.quantity = x.stock; }
    return next;
  }).filter((x) => x.quantity > 0));
  const remove = (c, i) => {   // taking an item out is recorded; without the right to void it needs a supervisor
    const note = (token) => posAPI.logVoid({ station_id: ctx.station.id, what: 'line', item: c.name, quantity: c.quantity, amount: priced?.lines?.[i]?.amount ?? 0, approval_token: token }).then(() => change(c.variant_id, { quantity: 0 })).catch((e) => toast.error(errMsg(e, 'Could not remove')));
    if (ctx.can.void) note(undefined); else setAsk({ purpose: 'void', why: `Removing ${c.name} from the sale needs a supervisor.`, then: (a) => note(a.token) });
  };

  const onEnter = async (e) => {
    if (e.key !== 'Enter' || !q.trim()) return;
    try {
      const r = await posAPI.scan(q.trim(), ctx.station.id);
      if (r.item) { add(r.item); setQ(''); } else if (found.length === 1) { add(found[0]); setQ(''); } else toast('No item with that code — pick from the list.');
    } catch (err) { toast.error(errMsg(err, 'Scan failed')); }
  };

  const pay = async (tenders) => {
    setBusy(true);
    try {
      const r = await posAPI.sell({ ...body(), key: key.current, tenders: tenders.filter((t) => t.amount > 0) });
      setDone(r); if (auto) print(r.id); setCart([]); setPaying(false); setCustomer(null); setCq(''); setApproval(null); key.current = newKey(); toast.success(`${r.type ?? 'Sale'} ${r.number} posted.`);
    } catch (e) { if (e?.response?.data?.approval === 'discount') { setPaying(false); setApproval(null); } toast.error(errMsg(e, 'The sale did not post'), { duration: 9000 }); } finally { setBusy(false); }
  };

  const print = async (id) => {
    try { printReceipt(await posAPI.receipt(id, paper || ctx.station.paper)); } catch (e) { toast.error(errMsg(e, 'Could not print'), { duration: 8000 }); }
  };
  const setAutoPrint = (v) => { setAuto(v); try { localStorage.setItem('pos.autoprint', v ? '1' : '0'); } catch { /* the choice is just not remembered */ } };
  const openMine = async () => { try { setMine((await posAPI.mySales()).sales); } catch (e) { toast.error(errMsg(e, 'Could not load your sales')); } };

  const hold = async () => {
    try { const label = window.prompt('Name this held sale (optional)') ?? ''; await posAPI.hold({ ...body(), label, customer_name: customer?.name, items: cart.map((c) => ({ variant_id: c.variant_id, quantity: c.quantity, name: c.name, discount_pct: c.discount_pct || 0 })) }); setCart([]); toast.success('Sale held.'); } catch (e) { toast.error(errMsg(e, 'Could not hold')); }
  };
  const openHolds = async () => { try { setHolds((await posAPI.holds()).holds); } catch (e) { toast.error(errMsg(e, 'Could not load held sales')); } };
  const recall = async (id) => {
    try {
      const h = await posAPI.recall(id);
      if (h.mode && ctx.can[h.mode === 'cash' ? 'sell' : h.mode]) setMode(h.mode);
      if (h.customer_id) setCustomer({ id: h.customer_id, name: h.customer_name ?? `Customer ${h.customer_id}` });
      setCart((c) => [...c, ...h.items.map((i) => ({ variant_id: i.variant_id, name: i.name, quantity: i.quantity, discount_pct: i.discount_pct || 0, price: null }))]);
      setHolds(null);
    } catch (e) { toast.error(errMsg(e, 'Could not recall')); openHolds(); }
  };

  if (!ctx) return <Shell><div style={{ padding: 32, color: colors.textFaint }}>{error ?? 'Loading…'}</div></Shell>;
  if (ctx.ready === false) return <Shell><p role="alert" style={{ ...card, padding: 16 }}>{ctx.message ?? 'The point of sale is not set up yet.'}</p></Shell>;
  if (!ctx.station) return <Shell><p role="alert" style={{ ...card, padding: 16 }}>You have no station to sell from. Ask a manager to add a station at your branch (POS stations) and give you one.</p></Shell>;

  const cur = ctx.currency;
  const unpriced = (priced?.lines ?? []).filter((l) => !(l.rate > 0));   // a line the books priced at nothing can not be sold
  const needShift = ctx.shift_ready && ctx.shift_required && !ctx.shift;
  const total = priced?.total ?? 0;
  const lineOf = (i) => priced?.lines?.[i];

  const helpCount = helpList?.length ?? 0;
  if (locked) {
    return (
      <main onClick={() => setLocked(false)} role="button" tabIndex={0} onKeyDown={() => setLocked(false)} aria-label="Touch to start" style={{ minHeight: '100vh', cursor: 'pointer', background: 'linear-gradient(160deg, var(--color-primary-500), var(--color-primary-600))', color: 'var(--text-inverse, #fff)', display: 'grid', placeContent: 'center', gap: 22, textAlign: 'center', padding: 40 }}>
        <ScanLine size={96} aria-hidden="true" style={{ justifySelf: 'center' }} />
        <span style={{ fontSize: 'clamp(2.4rem, 7vw, 4.5rem)', fontWeight: 900 }}>{ctx.business}</span>
        <span style={{ fontSize: 'clamp(1.5rem, 4vw, 2.4rem)', opacity: 0.9 }}>Point of sale — touch to start</span>
        <span style={{ opacity: 0.7 }}>{ctx.station.name} · {ctx.station.location}</span>
        {helpCount > 0 && <span style={{ background: '#dc2626', borderRadius: 999, padding: '8px 18px', justifySelf: 'center', fontWeight: 800 }}>{helpCount} customer{helpCount === 1 ? '' : 's'} asking for help</span>}
      </main>
    );
  }

  const tabs = (
    <div style={{ display: "flex", gap: 6 }} role="tablist" aria-label="Kind of document">
      {[['cash', 'Cash sale', ctx.can.sell], ['invoice', 'Invoice', ctx.can.invoice], ['order', 'Sales order', ctx.can.order], ['return', 'Return', ctx.can.return]].filter((m) => m[2]).map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} style={{ ...(mode === k ? btnPrimary : btnGhost), flex: 1 }}>{l}</button>
      ))}
    </div>
  );

  const extraDialogs = (
    <>
      {ask && <ApproveDialog purpose={ask.purpose} stationId={ctx.station.id} why={ask.why} onCancel={() => setAsk(null)} onDone={(a) => { const f = ask.then; setAsk(null); f(a); }} />}
      {shiftUi === 'open' && <OpenShiftDialog stationId={ctx.station.id} stationName={ctx.station.name} onCancel={() => setShiftUi(null)} onDone={() => { setShiftUi(null); loadCtx(ctx.station.id); }} />}
      {shiftUi === 'list' && <ShiftList onClose={() => setShiftUi(null)} onPick={(id) => setShiftUi({ id })} />}
      {shiftUi?.id && <ShiftDialog shiftId={shiftUi.id} paper={ctx.station.paper} onClose={() => setShiftUi(null)} onClosed={() => loadCtx(ctx.station.id)} />}
      {helpDlg && (
        <div role="dialog" aria-label="Help requests" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ ...card, padding: 18, width: 'min(420px, 100%)', display: 'grid', gap: 8 }}>
            <strong>Customers asking for help</strong>
            {helpCount === 0 && <p style={{ color: colors.textMuted, margin: 0 }}>Nobody is waiting.</p>}
            {(helpList ?? []).map((h) => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>{h.station} <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>· {h.minutes < 1 ? 'just now' : `${h.minutes} min ago`}{h.tries > 1 ? ` · asked ${h.tries} times` : ''}</span></span>
                <button type="button" style={btnPrimary} onClick={async () => {
                  try { await posAPI.helpDone(h.id); toast.success('Cleared.'); } catch (e) { toast.error(errMsg(e, 'Could not clear that request'), { duration: 8000 }); }
                  posAPI.helpRequests().then((r) => setHelpList(r.requests)).catch(() => {});
                }}>Done</button>
              </div>
            ))}
            {helpCount > 1 && <button type="button" style={btnGhost} onClick={async () => {
              try { const r = await posAPI.helpClear(); toast.success(`${r.cleared} cleared.`); } catch (e) { toast.error(errMsg(e, 'Could not clear')); }
              posAPI.helpRequests().then((r) => setHelpList(r.requests)).catch(() => {});
            }}>Clear all</button>}
            <p style={{ margin: 0, fontSize: '0.75rem', color: colors.textMuted }}>Go to the screen. A supervisor can clear a stuck basket there with their email and PIN.</p>
            <button type="button" style={btnGhost} onClick={() => setHelpDlg(false)}>Close</button>
          </div>
        </div>
      )}
      {mine && (
        <div role="dialog" aria-label="My sales today" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ ...card, padding: 18, width: 'min(460px, 100%)', display: 'grid', gap: 8, maxHeight: '80vh', overflowY: 'auto' }}>
            <strong>My sales today</strong>
            {mine.length === 0 && <p style={{ color: colors.textMuted, margin: 0 }}>Nothing yet today.</p>}
            {mine.map((m) => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>{m.number} <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>· {money(m.total, cur)}{m.status !== 'posted' ? ` · ${m.status}` : ''}</span></span>
                {ctx.can.reprint ? <button type="button" style={btnGhost} onClick={() => print(m.id)}>Reprint (copy)</button> : null}
              </div>
            ))}
            <button type="button" style={btnPrimary} onClick={() => setMine(null)}>Close</button>
          </div>
        </div>
      )}
      {pinOpen && <PinDialog onClose={(ok) => { setPinOpen(false); if (ok) loadCtx(ctx.station.id); }} />}
      {returned && (
        <div role="dialog" aria-label="Return done" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ ...card, padding: 22, width: 'min(380px, 100%)', display: 'grid', gap: 8, textAlign: 'center' }}>
            <strong style={{ fontSize: '1.1rem' }}>{returned.type ?? 'Credit note'} {returned.number}</strong>
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{money(returned.total, cur)}</div>
            <div style={{ fontSize: '0.85rem', color: colors.textMuted }}>Against {returned.against} · approved by {returned.approved_by}</div>
            <button type="button" style={btnPrimary} onClick={() => { setReturned(null); setMode('cash'); }}>Done</button>
          </div>
        </div>
      )}
    </>
  );

  if (mode === 'return') {
    return (
      <Shell>
        <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
          <div style={{ ...card, padding: 10 }}>{tabs}</div>
          <ReturnPanel ctx={ctx} cur={cur} onDone={(r) => setReturned(r)} />
        </div>
        {extraDialogs}
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ textAlign: 'right', marginBottom: 6, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {ctx.shift_ready && (ctx.shift
          ? <button type="button" style={btnGhost} onClick={() => setShiftUi({ id: ctx.shift.id })}>Shift open since {String(ctx.shift.opened_at).slice(11, 16)} — report / close</button>
          : <button type="button" style={btnPrimary} onClick={() => setShiftUi('open')}>Open shift</button>)}
        {ctx.shift_ready && ctx.can.supervise && <button type="button" style={btnGhost} onClick={() => setShiftUi('list')}>All shifts</button>}
        <button type="button" style={helpCount > 0 ? { ...btnPrimary, background: '#dc2626' } : btnGhost} onClick={() => setHelpDlg(true)}><LifeBuoy size={14} /> Help requests{helpCount > 0 ? ` (${helpCount})` : ''}</button>
        <button type="button" style={btnGhost} onClick={openMine}>My sales today</button>
        <button type="button" style={btnGhost} disabled={cart.length > 0} title={cart.length ? 'Finish or hold the sale first' : 'Lock the screen'} onClick={() => setLocked(true)}><Lock size={14} /> Lock</button>
        {ctx.can.supervise && <button type="button" style={btnGhost} onClick={() => setPinOpen(true)}>{ctx.can.has_pin ? 'Change my PIN' : 'Set my PIN'}</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <section style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={16} />
            <input ref={search} style={field} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onEnter} placeholder="Scan a barcode or search by name or code" aria-label="Search items" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, maxHeight: '68vh', overflowY: 'auto' }}>
            {found.map((it) => (
              <button key={it.variant_id} type="button" onClick={() => add(it)} style={{ ...card, padding: 10, textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 4, ...(it.price > 0 ? {} : { border: '2px solid #dc2626' }) }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{it.name}</span>
                <span style={{ fontSize: '0.78rem', color: colors.textMuted }}>{it.sku}</span>
                {it.price > 0 ? <span style={{ fontWeight: 800 }}>{money(it.price, cur)}</span> : <span style={{ fontWeight: 900, color: '#fff', background: '#dc2626', borderRadius: 6, padding: '4px 6px', textAlign: 'center', letterSpacing: '0.03em' }}>NO PRICE — CANNOT SELL</span>}
                {it.stock != null && <span style={{ fontSize: '0.72rem', color: it.stock <= 3 ? colors.danger : colors.textMuted }}>{it.stock} in stock</span>}
              </button>
            ))}
            {found.length === 0 && <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Nothing found.</p>}
          </div>
        </section>

        <section style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong>Sale</strong>
            <label style={{ fontSize: '0.78rem', color: colors.textMuted, display: 'flex', gap: 6, alignItems: 'center' }}>
              Station
              <select value={ctx.station.id} onChange={(e) => { setCart([]); loadCtx(Number(e.target.value)); }} style={{ ...field, width: 'auto', padding: '4px 8px' }} aria-label="Station">
                {ctx.stations.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.location}</option>)}
              </select>
            </label>
          </div>
          {unpriced.length > 0 && (
            <div role="alert" style={{ padding: '14px 16px', borderRadius: 10, background: '#dc2626', color: '#fff', fontWeight: 900, fontSize: '1.05rem', textAlign: 'center', letterSpacing: '0.02em' }}>
              NO PRICE — CANNOT CHECK OUT<div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{unpriced.map((l) => l.description).join(', ')}: remove {unpriced.length === 1 ? 'it' : 'them'} from the sale and ask a manager to set a price.</div>
            </div>
          )}
          {needShift && <p role="alert" style={{ margin: 0, padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, #d97706 12%, transparent)', fontSize: '0.82rem' }}>Open your shift to start selling.</p>}
          {tabs}
          {mode !== 'cash' && mode !== 'return' && (
            customer ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--line)' }}>
                <span><strong>{customer.name}</strong>{mode === 'invoice' && customer.credit_room != null ? <span style={{ fontSize: '0.75rem', color: colors.textMuted }}> · credit room {money(customer.credit_room, cur)}</span> : null}{mode === 'invoice' && customer.credit === false ? <span style={{ fontSize: '0.75rem', color: colors.danger }}> · no credit account</span> : null}</span>
                <button type="button" style={btnGhost} aria-label="Change customer" onClick={() => { setCustomer(null); setCq(''); }}><X size={14} /></button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 4 }}>
                <input style={field} value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Find the customer by name, phone or email" aria-label="Find customer" />
                {cfound.map((c) => (
                  <button key={c.id} type="button" style={{ ...btnGhost, textAlign: 'left' }} onClick={() => { setCustomer(c); setCfound([]); }}>
                    {c.name}{c.company ? ` · ${c.company}` : ''}{c.phone ? ` · ${c.phone}` : ''}{c.credit ? ` · credit room ${money(c.credit_room, cur)}` : ''}
                  </button>
                ))}
              </div>
            )
          )}
          {cart.length === 0 && <p style={{ color: colors.textMuted, fontSize: '0.85rem', margin: 0 }}>The basket is empty. Scan or tap an item.</p>}
          {cart.map((c, i) => (
            <div key={c.variant_id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{c.name}</div>
                <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>{lineOf(i) ? `${money(lineOf(i).rate, cur)} each` : ''}</div>
              </div>
              <div style={{ textAlign: 'right', fontWeight: 800 }}>{lineOf(i) ? money(lineOf(i).amount, cur) : ''}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button type="button" style={btnGhost} aria-label="Less" onClick={() => change(c.variant_id, { quantity: c.quantity - 1 })}><Minus size={14} /></button>
                <input style={{ ...field, width: 64, textAlign: 'center' }} inputMode="decimal" value={c.quantity} onChange={(e) => change(c.variant_id, { quantity: Number(e.target.value) || 0 })} aria-label="Quantity" />
                <button type="button" style={btnGhost} aria-label="More" onClick={() => change(c.variant_id, { quantity: c.quantity + 1 })}><Plus size={14} /></button>
                {ctx.can.discount && <input style={{ ...field, width: 72 }} inputMode="decimal" placeholder="% off" value={c.discount_pct || ''} onChange={(e) => change(c.variant_id, { discount_pct: Number(e.target.value) || 0 })} aria-label="Discount percent" />}
              </div>
              <button type="button" style={{ ...btnGhost, justifySelf: 'end', color: colors.danger }} aria-label={`Remove ${c.name}`} onClick={() => remove(c, i)}><Trash2 size={14} /></button>
            </div>
          ))}
          <div style={{ display: 'grid', gap: 4, fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{money(priced?.subtotal, cur)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tax</span><span>{money(priced?.tax_total, cur)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.3rem', fontWeight: 800 }}><span>Total</span><span>{money(total, cur)}</span></div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={btnGhost} disabled={!cart.length} onClick={hold}><Pause size={14} /> Hold</button>
            <button type="button" style={btnGhost} onClick={openHolds}><Play size={14} /> Recall</button>
            <button type="button" style={{ ...btnPrimary, flex: 1 }} disabled={!cart.length || !priced || (mode !== 'cash' && !customer) || needShift || unpriced.length > 0} onClick={() => setPaying(true)}>{{ cash: 'Checkout', invoice: 'Invoice', order: 'Place order' }[mode]} {money(total, cur)}</button>
          </div>
        </section>
      </div>

      {paying && <PayDialog total={total} methods={ctx.methods} cur={cur} busy={busy} mode={mode} customer={customer} onCancel={() => setPaying(false)} onPay={pay} />}

      {holds && (
        <div role="dialog" aria-label="Held sales" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ ...card, padding: 18, width: 'min(460px, 100%)', display: 'grid', gap: 8 }}>
            <strong>Held sales</strong>
            {holds.length === 0 && <p style={{ color: colors.textMuted, margin: 0 }}>Nothing is on hold.</p>}
            {holds.map((h) => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>{h.label || `Sale #${h.id}`} <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>· {h.lines} lines · {h.by}</span></span>
                <button type="button" style={btnPrimary} onClick={() => recall(h.id)}>Recall</button>
              </div>
            ))}
            <button type="button" style={btnGhost} onClick={() => setHolds(null)}>Close</button>
          </div>
        </div>
      )}

      {done && (
        <div role="dialog" aria-label="Sale done" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ ...card, padding: 22, width: 'min(380px, 100%)', display: 'grid', gap: 8, textAlign: 'center' }}>
            <strong style={{ fontSize: '1.1rem' }}>{done.type ?? 'Sale'} {done.number}</strong>
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{money(done.total, cur)}</div>
            {done.paid_now != null && <div style={{ fontSize: '0.9rem' }}>Paid now: <strong>{money(done.paid_now, cur)}</strong> · to pay later: <strong>{money(done.total - done.paid_now, cur)}</strong></div>}
            {done.change > 0 && <div style={{ fontSize: '1.1rem' }}>Change due: <strong>{money(done.change, cur)}</strong></div>}
            <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>{done.tenders.map((t) => `${t.method} ${money(t.amount, cur)}`).join(' · ')}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
              <select style={{ ...field, width: 'auto' }} value={paper || ctx.station.paper} onChange={(e) => setPaper(e.target.value)} aria-label="Receipt paper">
                {(ctx.branch?.paper_allowed ?? Object.keys(PAPER)).map((k) => <option key={k} value={k}>{PAPER[k]?.label ?? k}</option>)}
              </select>
              <button type="button" style={btnGhost} onClick={() => print(done.id)}>Print 2 copies</button>
            </div>
            <label style={{ fontSize: '0.78rem', color: colors.textMuted }}><input type="checkbox" checked={auto} onChange={(e) => setAutoPrint(e.target.checked)} /> Print automatically after each sale</label>
            <button type="button" style={btnPrimary} onClick={() => { setDone(null); setMode('cash'); }}>New sale</button>
          </div>
        </div>
      )}
      {extraDialogs}
    </Shell>
  );
}
