import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Truck, PackageCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import preordersAPI from '../../../../_shared/api/preorders';
import booksAPI from '../../../../_shared/api/books';
import Modal from '../ui/Modal';
import { Field, TextInput, SelectInput, FormStack, ModalActions, FormError } from '../ui/Form';
import { hasPermission } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { money } from './booksFmt';

const th = { padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 12px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const chip = { paid: ['Paid', '#16a34a'], invoiced: ['On account', '#d97706'], unpaid: ['Not paid', '#9ca3af'] };

const qty = (n) => (Math.round(Number(n) * 10000) / 10000).toString();

/**
 * Customers asking to cancel a paid preorder. Approving writes one credit note for everything still owed and, for a sale paid at the till, gives the money back
 * from the chosen ledger (the one the sale was paid into is chosen for you). Declining needs a reason: the customer reads it.
 */
function CancelRequests({ rows, canAct, onChanged }) {
  const [pick, setPick] = useState({});   // order id -> { ledger, note }
  const [busy, setBusy] = useState(null);
  const set = (id, patch) => setPick((p) => ({ ...p, [id]: { ...(p[id] ?? {}), ...patch } }));
  const act = async (r, kind) => {
    const v = pick[r.order_id] ?? {};
    if (kind === 'decline' && !(v.note ?? '').trim()) { toast.error('Write the reason the customer will read.'); return; }
    if (kind === 'approve' && !window.confirm(`Cancel ${r.number} and ${r.refund ? 'refund ' + money(r.total) : 'credit ' + money(r.total)}?`)) return;
    setBusy(r.order_id);
    try {
      const res = kind === 'approve'
        ? await preordersAPI.approveCancel(r.order_id, { refund_ledger_id: v.ledger ? Number(v.ledger) : undefined, note: v.note || undefined })
        : await preordersAPI.declineCancel(r.order_id, v.note.trim());
      toast.success(res.message, { duration: 7000 }); onChanged();
    } catch (e) { toast.error(errMsg(e, 'Could not do that'), { duration: 8000 }); } finally { setBusy(null); }
  };
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.1)', fontSize: '0.84rem', fontWeight: 700 }}>Customers asking to cancel ({rows.length})</div>
      {rows.map((r) => {
        const v = pick[r.order_id] ?? {};
        return (
          <div key={r.order_id} style={{ padding: '12px 14px', borderTop: `1px solid ${colors.tint(0.05)}`, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <strong style={{ fontFamily: 'monospace' }}>{r.number}</strong>
              <span style={{ fontSize: '0.82rem' }}>{r.customer}{r.email ? ` · ${r.email}` : ''}</span>
              <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>{money(r.total)}{r.sale ? ` · ${r.sale.kind === 'paid' ? 'paid' : 'on account'} (${r.sale.number})` : ''}</span>
              {r.ticket && <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>{r.ticket}</span>}
            </div>
            {r.reason && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>“{r.reason}”</p>}
            {r.blocked && <p style={{ margin: 0, fontSize: '0.78rem', color: colors.warningText }}>{r.blocked}</p>}
            {canAct && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {r.refund && (
                  <label style={{ fontSize: '0.76rem', display: 'inline-flex', gap: 6, alignItems: 'center' }}>Refund from
                    <select value={v.ledger ?? r.refund.default_id ?? ''} onChange={(e) => set(r.order_id, { ledger: e.target.value })} style={{ padding: '5px 8px', borderRadius: 8 }}>
                      <option value="">Choose…</option>
                      {r.refund.ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </label>
                )}
                <input aria-label="Note to the customer" placeholder="Note (required to decline)" value={v.note ?? ''} onChange={(e) => set(r.order_id, { note: e.target.value })} style={{ flex: 1, minWidth: 180, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', fontFamily: 'inherit' }} />
                <button type="button" style={btnPrimary} disabled={busy === r.order_id || !!r.blocked} onClick={() => act(r, 'approve')}>Cancel and refund</button>
                <button type="button" style={btnGhost} disabled={busy === r.order_id} onClick={() => act(r, 'decline')}>Decline</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A preorder taken at the counter: pick what is on offer, who it is for, and how it is paid (in full by cash sale, or an invoice on account). */
function CounterModal({ branches, onClose, onDone }) {
  const [loc, setLoc] = useState(branches[0]?.id ?? '');
  const [open, setOpen] = useState([]);
  const [lines, setLines] = useState([{ variant_id: '', quantity: 1 }]);
  const [cust, setCust] = useState(null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState([]);
  const [walkin, setWalkin] = useState('');
  const [pay, setPay] = useState('sale');
  const [methods, setMethods] = useState([]);
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { booksAPI.paymentMethods().then((r) => { const l = Array.isArray(r) ? r : r.data ?? []; setMethods(l); setMethod(l[0]?.id ?? ''); }).catch(() => {}); }, []);
  useEffect(() => { if (loc) preordersAPI.open(loc).then((r) => { setOpen(r.data); setLines([{ variant_id: '', quantity: 1 }]); }).catch(() => setOpen([])); }, [loc]);
  useEffect(() => {
    if (cust || search.trim().length < 2) { setFound([]); return undefined; }
    const t = setTimeout(() => preordersAPI.customers(search.trim()).then((r) => setFound(r.data)).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [search, cust]);

  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const ready = loc && lines.every((l) => l.variant_id && Number(l.quantity) > 0) && (cust || walkin.trim()) && (pay !== 'sale' || method) && (pay !== 'invoice' || cust?.on_account);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await preordersAPI.counter({ location_id: Number(loc), customer_id: cust?.id, party_name: cust ? undefined : walkin.trim(), pay, payment_method_id: pay === 'sale' ? Number(method) : undefined,
        items: lines.map((l) => ({ variant_id: Number(l.variant_id), quantity: Number(l.quantity) })) });
      toast.success(r.message); onDone();
    } catch (e) { setErr(errMsg(e, 'Could not take the preorder')); } finally { setBusy(false); }
  };

  return (
    <Modal title="Take a preorder" subtitle="Numbered PRE-…; no stock is taken. Delivery follows as stock arrives." onClose={onClose} width={620}>
      <FormStack>
        {branches.length > 1 && <Field label="Branch"><SelectInput value={loc} onChange={(e) => setLoc(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>}
        {open.length === 0 && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Nothing is open for preorder at this branch right now.</p>}
        {open.length > 0 && lines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px auto', gap: 8 }}>
            <SelectInput value={l.variant_id} onChange={(e) => setLine(i, { variant_id: e.target.value })}>
              <option value="">Choose an item…</option>
              {open.map((o) => <option key={o.offer_id} value={o.variant_id}>{o.item}{o.option ? ` · ${o.option}` : ''}{o.places_left !== null ? ` (${o.places_left} places)` : ''}</option>)}
            </SelectInput>
            <TextInput type="number" min="1" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
            <button type="button" style={btnGhost} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1}>×</button>
          </div>
        ))}
        {open.length > 0 && <div><button type="button" style={btnGhost} onClick={() => setLines((ls) => [...ls, { variant_id: '', quantity: 1 }])}><Plus size={12} /> Another item</button></div>}

        <Field label="Customer" hint={cust ? undefined : 'Search a customer, or type a name for a walk-in.'}>
          {cust ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><strong>{cust.name}</strong><span style={{ fontSize: '0.75rem', color: colors.textMuted }}>{cust.phone || cust.email}</span><button type="button" style={btnGhost} onClick={() => setCust(null)}>Change</button></div>
          ) : (
            <>
              <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone or email" />
              {found.length > 0 && <div style={{ display: 'grid', gap: 3, marginTop: 4 }}>{found.map((c) => <button key={c.id} type="button" style={{ ...btnGhost, justifyContent: 'flex-start' }} onClick={() => { setCust(c); setSearch(''); }}>{c.name} <span style={{ color: colors.textFaint, marginLeft: 8 }}>{c.phone || c.email}</span></button>)}</div>}
              <TextInput value={walkin} onChange={(e) => setWalkin(e.target.value)} placeholder="Walk-in name" style={{ marginTop: 6 }} />
            </>
          )}
        </Field>

        <Field label="Payment">
          <SelectInput value={pay} onChange={(e) => setPay(e.target.value)}>
            <option value="sale">Paid in full now (cash sale)</option>
            <option value="invoice" disabled={!cust?.on_account}>Invoice on the customer's account</option>
            <option value="none">Not paid yet (order only)</option>
          </SelectInput>
        </Field>
        {pay === 'sale' && <Field label="Paid by"><SelectInput value={method} onChange={(e) => setMethod(e.target.value)}>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</SelectInput></Field>}
        <FormError message={err} />
        <ModalActions onCancel={onClose} submitLabel="Take preorder" busyLabel="Saving…" busy={busy} onSubmit={save} disabled={!ready || open.length === 0} />
      </FormStack>
    </Modal>
  );
}

/** Send some stock from another branch to the one whose preorders are waiting (an ordinary transfer). */
function SendButton({ variantId, to, from, onDone }) {
  const [n, setN] = useState(from.quantity);
  const go = async () => {
    try { const r = await preordersAPI.send({ from_location_id: from.location_id, to_location_id: to, variant_id: variantId, quantity: Number(n) }); toast.success(r.message); onDone(); }
    catch (e) { toast.error(errMsg(e, 'Could not send it')); }
  };
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <input type="number" min="0" max={from.quantity} value={n} onChange={(e) => setN(e.target.value)} style={{ width: 64, padding: '3px 6px', fontSize: '0.75rem' }} aria-label={`How many to send from ${from.branch}`} />
      <button type="button" style={{ ...btnGhost, padding: '3px 8px', fontSize: '0.72rem' }} onClick={go}><Truck size={11} /> from {from.branch}</button>
    </span>
  );
}

/** Orders > Preorders waiting: what was promised and is not delivered yet, oldest first, with what could fill it. */
export default function PreordersWaiting() {
  const [loc, setLoc] = useState('');
  const [data, setData] = useState(null);
  const [counter, setCounter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asks, setAsks] = useState([]);   // customers asking to cancel a paid preorder
  const canStock = hasPermission(null, 'stock.manage');
  const canPost = hasPermission(null, 'books.post');

  const load = useCallback(() => preordersAPI.waiting(loc).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the preorders'))), [loc]);
  useEffect(() => { load(); }, [load]);
  const loadAsks = useCallback(() => preordersAPI.cancelRequests().then((r) => setAsks(r.data)).catch(() => setAsks([])), []);
  useEffect(() => { loadAsks(); }, [loadAsks]);

  const groups = useMemo(() => {
    const m = new Map();
    (data?.lines ?? []).forEach((l) => { const k = `${l.variant_id}:${l.location_id}`; if (!m.has(k)) m.set(k, []); m.get(k).push(l); });
    return [...m.entries()];
  }, [data]);

  const deliver = async (body) => {
    setBusy(true);
    try {
      const r = await preordersAPI.deliver(body);
      (r.failed ?? []).forEach((f) => toast.error(`${f.order}: ${f.message}`, { duration: 8000 }));
      if (r.made.length) toast.success(r.message); else if (!r.failed.length) toast(r.message);
      load();
    } catch (e) { toast.error(errMsg(e, 'Could not make the delivery notes')); } finally { setBusy(false); }
  };

  if (!data) return <p style={{ color: colors.textMuted }}>Loading…</p>;
  if (!data.ready) return <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Preorders are not set up yet. Run database script 103_preorders.sql, then reload.</p>;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {data.branches.length > 1 && (
          <select value={loc} onChange={(e) => setLoc(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8 }} aria-label="Branch">
            <option value="">All branches</option>
            {data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <span style={{ flex: 1 }} />
        {canPost && <button type="button" style={btnGhost} onClick={() => setCounter(true)}><Plus size={13} /> Take a preorder</button>}
        {canStock && groups.length > 0 && <button type="button" style={btnPrimary} disabled={busy} onClick={() => deliver({ location_id: loc || undefined })}><PackageCheck size={13} /> Deliver what stock allows</button>}
      </div>

      <div style={{ ...card, padding: '10px 14px', fontSize: '0.8rem', color: colors.textMuted }}>
        <strong style={{ color: colors.text }}>Paid, not yet delivered: {money(data.paid_not_delivered.value)}</strong> across {data.paid_not_delivered.lines} line{data.paid_not_delivered.lines === 1 ? '' : 's'}. This income is already in the books; the cost of the goods is booked when they are delivered, so profit looks higher until then (before tax).
      </div>

      {asks.length > 0 && <CancelRequests rows={asks} canAct={canPost} onChanged={() => { loadAsks(); load(); }} />}

      {groups.length === 0 && <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>No preorders are waiting.</p>}
      {groups.map(([key, rows]) => {
        const first = rows[0];
        const s = data.supply[key] ?? {};
        const owedTotal = rows.reduce((t, r) => t + r.owed, 0);
        return (
          <div key={key} style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap', background: colors.tint(0.03) }}>
              <strong>{first.item}{first.option ? ` · ${first.option}` : ''}</strong>
              {data.branches.length > 1 && <span style={{ fontSize: '0.78rem', color: colors.textMuted }}>{first.branch}</span>}
              <span style={{ fontSize: '0.78rem' }}>owed <strong>{qty(owedTotal)}</strong></span>
              <span style={{ fontSize: '0.78rem', color: colors.textMuted }}>in stock {qty(s.stock_here ?? 0)}{s.in_transit_here ? ` · on its way ${qty(s.in_transit_here)}` : ''}{s.planned ? ` · ordered from suppliers ${qty(s.planned)}` : ''}</span>
              <span style={{ flex: 1 }} />
              {canStock && (s.stock_here ?? 0) > 0 && <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' }} disabled={busy} onClick={() => deliver({ location_id: first.location_id, variant_id: first.variant_id })}>Deliver this</button>}
            </div>
            {canStock && (s.elsewhere ?? []).length > 0 && (
              <div style={{ padding: '8px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.76rem', color: colors.textMuted, borderTop: `1px solid ${colors.tint(0.05)}` }}>
                Could be sent:
                {s.elsewhere.map((e) => <SendButton key={e.location_id} variantId={first.variant_id} to={first.location_id} from={e} onDone={load} />)}
              </div>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Order</th><th style={th}>Customer</th><th style={th}>Payment</th><th style={{ ...th, textAlign: 'right' }}>Ordered</th><th style={{ ...th, textAlign: 'right' }}>Still owed</th><th style={th}>Promised</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.order_id}-${r.item_id}`}>
                      <td style={td}><Link to={`/admin/orders/${r.order_id}`}>{r.order_number}</Link>{r.sale_number && <span style={{ marginLeft: 8, color: colors.textFaint }}>{r.sale_number}</span>}<div style={{ fontSize: '0.68rem', color: colors.textFaint }}>{r.date}</div></td>
                      <td style={td}>{r.customer || '—'}</td>
                      <td style={td}><span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, color: chip[r.payment][1], background: `${chip[r.payment][1]}1a` }}>{chip[r.payment][0]}</span></td>
                      <td style={{ ...td, ...num }}>{qty(r.ordered)}</td>
                      <td style={{ ...td, ...num, fontWeight: 700 }}>{qty(r.owed)}</td>
                      <td style={td}>{r.promised || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {counter && <CounterModal branches={data.branches} onClose={() => setCounter(false)} onDone={() => { setCounter(false); load(); }} />}
    </div>
  );
}
