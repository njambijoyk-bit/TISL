import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Minus, Plus, Trash2, Pause, Play, X, Search } from 'lucide-react';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import posAPI from '../../../../_shared/api/pos';
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
  const [customer, setCustomer] = useState(null);
  const [cq, setCq] = useState('');
  const [cfound, setCfound] = useState([]);
  const key = useRef(newKey());
  const search = useRef(null);

  const loadCtx = useCallback((stationId) => posAPI.context(stationId).then(setCtx).catch((e) => setError(errMsg(e, 'Could not open the point of sale'))), []);
  useEffect(() => { loadCtx(); }, [loadCtx]);
  useEffect(() => { search.current?.focus(); }, [ctx, done]);

  useEffect(() => {   // search as they type
    const t = setTimeout(() => { if (ctx?.ready !== false) posAPI.catalogue(q).then((r) => setFound(r.items)).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [q, ctx]);

  const body = useCallback(() => ({ station_id: ctx?.station?.id, mode, customer_id: mode === 'cash' ? undefined : customer?.id, items: cart.map((c) => ({ variant_id: c.variant_id, quantity: c.quantity, discount_pct: c.discount_pct || 0 })) }), [ctx, cart, mode, customer]);
  useEffect(() => {   // the books price the basket: the total shown is the one that will post
    if (!cart.length || !ctx?.station) { setPriced(null); return undefined; }
    let live = true;
    const t = setTimeout(() => { posAPI.price(body()).then((r) => live && setPriced(r)).catch((e) => live && toast.error(errMsg(e, 'Could not price the basket'))); }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [cart, ctx, body]);

  useEffect(() => {
    if (mode === 'cash' || customer || cq.trim().length < 2) { setCfound([]); return undefined; }
    const t = setTimeout(() => { posAPI.customers(cq).then((r) => setCfound(r.customers)).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [cq, mode, customer]);

  const add = (it) => setCart((c) => (c.some((x) => x.variant_id === it.variant_id) ? c.map((x) => (x.variant_id === it.variant_id ? { ...x, quantity: x.quantity + 1 } : x)) : [...c, { variant_id: it.variant_id, name: it.name, quantity: 1, discount_pct: 0, price: it.price }]));
  const change = (id, patch) => setCart((c) => c.map((x) => (x.variant_id === id ? { ...x, ...patch } : x)).filter((x) => x.quantity > 0));

  const onEnter = async (e) => {
    if (e.key !== 'Enter' || !q.trim()) return;
    try {
      const r = await posAPI.scan(q.trim());
      if (r.item) { add(r.item); setQ(''); } else if (found.length === 1) { add(found[0]); setQ(''); } else toast('No item with that code — pick from the list.');
    } catch (err) { toast.error(errMsg(err, 'Scan failed')); }
  };

  const pay = async (tenders) => {
    setBusy(true);
    try {
      const r = await posAPI.sell({ ...body(), key: key.current, tenders: tenders.filter((t) => t.amount > 0) });
      setDone(r); setCart([]); setPaying(false); setCustomer(null); setCq(''); key.current = newKey(); toast.success(`${r.type ?? 'Sale'} ${r.number} posted.`);
    } catch (e) { toast.error(errMsg(e, 'The sale did not post'), { duration: 9000 }); } finally { setBusy(false); }
  };

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

  if (!ctx) return <AdminLayout><div style={{ padding: 32, color: colors.textFaint }}>{error ?? 'Loading…'}</div></AdminLayout>;
  if (ctx.ready === false) return <AdminLayout><p role="alert" style={{ ...card, padding: 16 }}>{ctx.message ?? 'The point of sale is not set up yet.'}</p></AdminLayout>;
  if (!ctx.station) return <AdminLayout><p role="alert" style={{ ...card, padding: 16 }}>You have no station to sell from. Ask a manager to add a station at your branch (POS stations) and give you one.</p></AdminLayout>;

  const cur = ctx.currency;
  const total = priced?.total ?? 0;
  const lineOf = (i) => priced?.lines?.[i];

  return (
    <AdminLayout>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <section style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={16} />
            <input ref={search} style={field} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onEnter} placeholder="Scan a barcode or search by name or code" aria-label="Search items" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, maxHeight: '68vh', overflowY: 'auto' }}>
            {found.map((it) => (
              <button key={it.variant_id} type="button" onClick={() => add(it)} style={{ ...card, padding: 10, textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 4 }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{it.name}</span>
                <span style={{ fontSize: '0.78rem', color: colors.textMuted }}>{it.sku}</span>
                <span style={{ fontWeight: 800 }}>{it.price == null ? 'No price' : money(it.price, cur)}</span>
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
          <div style={{ display: 'flex', gap: 6 }} role="tablist" aria-label="Kind of document">
            {[['cash', 'Cash sale', ctx.can.sell], ['invoice', 'Invoice', ctx.can.invoice], ['order', 'Sales order', ctx.can.order]].filter((m) => m[2]).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} style={{ ...(mode === k ? btnPrimary : btnGhost), flex: 1 }}>{l}</button>
            ))}
          </div>
          {mode !== 'cash' && (
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
              <button type="button" style={{ ...btnGhost, justifySelf: 'end', color: colors.danger }} aria-label={`Remove ${c.name}`} onClick={() => change(c.variant_id, { quantity: 0 })}><Trash2 size={14} /></button>
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
            <button type="button" style={{ ...btnPrimary, flex: 1 }} disabled={!cart.length || !priced || (mode !== 'cash' && !customer)} onClick={() => setPaying(true)}>{{ cash: 'Checkout', invoice: 'Invoice', order: 'Place order' }[mode]} {money(total, cur)}</button>
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
            <button type="button" style={btnPrimary} onClick={() => { setDone(null); setMode('cash'); }}>New sale</button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
