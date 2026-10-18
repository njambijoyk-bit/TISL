import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { CheckCircle2, Loader2, ShoppingBasket } from 'lucide-react';
import menusPublicAPI from '../../../_shared/api/menusPublic';
import checkoutAPI from '../../../_shared/api/checkout';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import DishPicker from '../../components/DishPicker';
import { useBasket, basketItems, needsChoice } from '../../lib/basket';
import { DishCard } from './MenuPage';

const money = (n) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const card = { background: 'var(--surface-card, #fff)', borderRadius: 14, border: '1px solid var(--line, #e5e7eb)', padding: 16 };
const field = { width: '100%', padding: '11px 12px', borderRadius: 10, border: '1.5px solid var(--line, #e5e7eb)', fontFamily: 'inherit', fontSize: '0.95rem', boxSizing: 'border-box', background: 'var(--surface-input, #fff)', color: 'inherit' };
const primary = { padding: '12px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.95rem', color: '#fff', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' };
const POLL_MS = 3000;
const GIVE_UP = 50;

/** The page behind the QR code on a table: the menu, order to the kitchen, see the tab, ask for the bill and pay it by M-Pesa or card from the phone. No sign-in. */
export default function TablePage() {
  const { qr } = useParams();
  const [data, setData] = useState(null);
  const [lost, setLost] = useState(false);
  const basket = useBasket(null);
  const [menuId, setMenuId] = useState(null);
  const [picking, setPicking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [pay, setPay] = useState({ method: '', phone: '', tip: '' });
  const [phase, setPhase] = useState(null);   // null | { kind: 'waiting' } | { kind: 'paid' } | { kind: 'failed', reason }
  const stop = useRef(false);

  const load = useCallback(() => menusPublicAPI.table(qr).then((r) => { setData(r); setMenuId((m) => m ?? (r.menu.menus.find((x) => x.serving_now) ?? r.menu.menus[0])?.id ?? null); setPay((p) => ({ ...p, method: p.method || String(r.payment_methods.find((m) => m.gateway === 'mpesa_stk')?.id ?? r.payment_methods[0]?.id ?? '') })); }).catch((e) => { if (e?.response?.status === 404) setLost(true); }), [qr]);
  useEffect(() => { load(); const t = setInterval(() => { if (!stop.current) load(); }, 15000); return () => { clearInterval(t); stop.current = true; }; }, [load]);
  useEffect(() => { stop.current = false; }, []);

  const send = async () => {
    setBusy(true);
    try {
      const r = await menusPublicAPI.tableOrder(qr, { items: basketItems(basket.lines) });
      setData(r); basket.clear(); toast.success(r.message);
    } catch (e) { toast.error(errMsg(e, 'We could not send that. Please ask a member of staff.'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const bill = async () => { try { const r = await menusPublicAPI.tableBill(qr); setData(r); toast.success(r.message); } catch (e) { toast.error(errMsg(e, 'Please ask a member of staff.')); } };

  const wait = async (attempt) => {
    for (let n = 0; n < GIVE_UP && !stop.current; n += 1) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (stop.current) return;
      try {
        const s = await checkoutAPI.paymentStatus(attempt.id, attempt.token, true);
        if (s.status === 'confirmed') { setPhase({ kind: 'paid' }); return; }
        if (s.status === 'failed') { setPhase({ kind: 'failed', reason: s.failure_reason || 'The payment did not go through.' }); await load(); return; }
      } catch { /* keep asking */ }
    }
    if (!stop.current) { setPhase({ kind: 'failed', reason: 'We have not heard from M-Pesa yet. If you paid, the staff will see it shortly.' }); await load(); }
  };
  const payNow = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await menusPublicAPI.tablePay(qr, { payment_method_id: Number(pay.method), phone: pay.phone, tip: Number(pay.tip) || undefined });
      if (r.redirect_url) { window.location.assign(r.redirect_url); return; }
      setPhase({ kind: 'waiting', message: r.message }); wait(r.attempt);
    } catch (err) { toast.error(errMsg(err, 'We could not start the payment.'), { duration: 8000 }); } finally { setBusy(false); }
  };

  if (lost) return <main style={{ maxWidth: 520, margin: '60px auto', padding: 20 }}><div style={card} role="alert"><h1 style={{ margin: 0, fontSize: '1.2rem' }}>We could not find this table</h1><p>Please ask a member of staff.</p></div></main>;
  if (!data) return <main style={{ maxWidth: 520, margin: '60px auto', padding: 20 }}>Loading…</main>;
  if (phase?.kind === 'paid') return <main style={{ maxWidth: 520, margin: '60px auto', padding: 20 }}><div role="status" style={{ ...card, textAlign: 'center', display: 'grid', gap: 8, justifyItems: 'center' }}><CheckCircle2 size={40} color="#047857" /><h1 style={{ margin: 0, fontSize: '1.3rem' }}>Paid. Thank you!</h1><p style={{ margin: 0, color: 'var(--text-secondary)' }}>We hope to see you again.</p></div></main>;

  const menu = data.menu.menus.find((m) => m.id === menuId);
  const ok = data.allowed.ok;
  const tab = data.tab;
  const tipsOn = data.tips_on;

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px 120px', display: 'grid', gap: 16 }} data-testid="table-page">
      <Helmet><title>{data.table.name} | Menu</title></Helmet>
      <header><h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: 900 }}>{data.table.name}</h1>{!ok && <p role="status" style={{ margin: '6px 0 0', color: '#b45309', fontWeight: 700 }}>{data.allowed.why}</p>}</header>

      {tab && (
        <section aria-label="Your tab" style={card} data-testid="tab">
          <h2 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800 }}>Your order so far</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4, fontSize: '0.92rem' }}>
            {tab.lines.map((l, i) => <li key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{l.quantity} × {l.name}{l.options.length > 0 && <small style={{ color: 'var(--text-tertiary)' }}> · {l.options.join(', ')}</small>}</span><span>{money(l.amount)}</span></li>)}
          </ul>
          <p style={{ margin: '8px 0 0', fontWeight: 800 }}>Total so far (with tax): {money(tab.total)}</p>
          {tab.service_charge_pct > 0 && <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>A {tab.service_charge_pct}% service charge is added to the bill.</p>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            {!data.bill_asked && tab.payment === 'open' && <button type="button" style={{ ...primary, background: '#d97706' }} onClick={bill}>Ask for the bill</button>}
            {data.bill_asked && <span role="status" style={{ fontWeight: 700, color: '#047857' }}>The bill is on its way.</span>}
            {tab.payment === 'open' && data.payment_methods.length > 0 && !paying && <button type="button" style={primary} onClick={() => setPaying(true)}>Pay now</button>}
          </div>
          {tab.payment === 'pending' && phase?.kind !== 'waiting' && <p role="status" style={{ marginBottom: 0 }}>The bill is being paid…</p>}
          {paying && tab.payment === 'open' && !phase && (
            <form onSubmit={payNow} aria-label="Pay the bill" style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              {data.payment_methods.length > 1 && <select aria-label="Pay with" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} style={field}>{data.payment_methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
              <input required aria-label="Phone number" inputMode="tel" autoComplete="tel" placeholder="Phone number for M-Pesa" value={pay.phone} onChange={(e) => setPay({ ...pay, phone: e.target.value })} style={field} />
              {tipsOn && <input aria-label="Tip" type="number" min="0" step="any" inputMode="decimal" placeholder="Tip (optional)" value={pay.tip} onChange={(e) => setPay({ ...pay, tip: e.target.value })} style={field} />}
              <button type="submit" disabled={busy} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>{busy ? 'Starting…' : 'Pay the bill'}</button>
            </form>
          )}
          {phase?.kind === 'waiting' && <div role="status" style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}><Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} /> <span>{phase.message} Waiting for your payment…</span></div>}
          {phase?.kind === 'failed' && <p role="alert" style={{ color: '#b91c1c', marginBottom: 0 }}>{phase.reason} <button type="button" onClick={() => { setPhase(null); }} style={{ ...field, width: 'auto', cursor: 'pointer', fontWeight: 700 }}>Try again</button></p>}
        </section>
      )}

      {data.menu.menus.length > 0 && (
        <section aria-label="Menu">
          <div role="tablist" aria-label="Menus" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {data.menu.menus.map((m) => <button key={m.id} type="button" role="tab" aria-selected={m.id === menuId} onClick={() => setMenuId(m.id)} style={{ padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, border: `1.5px solid ${m.id === menuId ? 'var(--color-primary-500)' : 'var(--line, #e5e7eb)'}`, background: 'transparent', color: 'inherit' }}>{m.name}{m.serving_now ? '' : ' · later'}</button>)}
          </div>
          {menu?.sections.map((s) => (
            <div key={s.id} style={{ marginBottom: 20 }}>
              <h2 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 800 }}>{s.name}</h2>
              <div style={{ display: 'grid', gap: 10 }}>{s.dishes.map((d) => <DishCard key={d.id} d={d} avoid={[]} data={data.menu} ordering={ok && menu.serving_now} onAdd={(x) => (needsChoice(x) ? setPicking(x) : basket.add(x))} />)}</div>
            </div>
          ))}
          {data.menu.note && <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{data.menu.note}</p>}
        </section>
      )}

      {ok && basket.count > 0 && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: 12, background: 'var(--surface-card, #fff)', borderTop: '1px solid var(--line, #e5e7eb)', display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', zIndex: 50 }} data-testid="basket-bar">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800 }}><ShoppingBasket size={18} aria-hidden="true" /> {basket.count} item{basket.count === 1 ? '' : 's'} · {money(basket.subtotal)} + tax</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={basket.clear} style={{ ...field, width: 'auto', cursor: 'pointer', fontWeight: 700 }}>Clear</button>
            <button type="button" disabled={busy} onClick={send} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>Send to the kitchen</button>
          </span>
        </div>
      )}
      {picking && <DishPicker dish={picking} onClose={() => setPicking(null)} onAdd={(d, o) => { basket.add(d, o); setPicking(null); }} />}
    </main>
  );
}
