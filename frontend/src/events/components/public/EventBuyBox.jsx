import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Loader2, Smartphone, XCircle, CreditCard } from 'lucide-react';
import eventsPublicAPI from '../../../_shared/api/eventsPublic';
import checkoutAPI from '../../../_shared/api/checkout';
import useAuthStore from '../../../_shared/store/authStore';
import { formatMoney } from '../../../_shared/lib/money';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import TicketPicker from './TicketPicker';

const POLL_MS = 3000;
const GIVE_UP = 60;   // about 3 minutes of asking before we say the confirmation will come by email
const card = { background: 'var(--surface-card, #fff)', borderRadius: 14, border: '1px solid var(--line)', padding: 18, boxShadow: '0 1px 8px rgba(0,0,0,0.05)' };
const field = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--surface-input, #fff)', color: 'inherit', fontFamily: 'inherit', fontSize: '0.9rem', boxSizing: 'border-box' };
const label = { display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 };
const primary = { width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.95rem', color: '#fff', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' };

/** What the buyer sees once tickets exist: each ticket's reference and the name on it. */
function TicketsReady({ title, tickets, note }) {
  return (
    <div role="status" style={{ ...card, display: 'grid', gap: 10, textAlign: 'center', justifyItems: 'center' }}>
      <CheckCircle2 size={36} color="#047857" />
      <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{title}</h2>
      {note && <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)' }}>{note}</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6, width: '100%' }}>
        {tickets.map((t) => (
          <li key={t.reference} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)', fontSize: '0.86rem' }}>
            <span>{t.type ? `${t.type} · ` : ''}{t.holder_name || 'Ticket'}</span><code style={{ fontWeight: 800 }}>{t.reference}</code>
          </li>
        ))}
      </ul>
      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Keep these references: they identify your tickets at the door.</p>
    </div>
  );
}

/**
 * Choose tickets, say who you are, pay. No account is needed. The price shown comes from the server (with tax). M-Pesa asks for the PIN on the phone and this box waits for it; a
 * card sends the buyer to the provider's page and they come back to the payment-return page.
 */
export default function EventBuyBox({ event }) {
  const user = useAuthStore((s) => s.user);
  const customer = useAuthStore((s) => s.customer);
  const [qty, setQty] = useState({});
  const [buyer, setBuyer] = useState({ name: user?.name ?? '', email: user?.email ?? '', phone: customer?.phone ?? '' });
  const [methodId, setMethodId] = useState(event.payment_methods?.find((m) => m.gateway === 'mpesa_stk')?.id ?? event.payment_methods?.[0]?.id ?? '');
  const [namesOn, setNamesOn] = useState(false);
  const [holders, setHolders] = useState([]);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(null);   // null | { kind: 'waiting', attempt, hold } | { kind: 'done', tickets, title, note } | { kind: 'failed', reason }
  const stop = useRef(false);

  const items = useMemo(() => Object.entries(qty).filter(([, n]) => n > 0).map(([id, n]) => ({ ticket_type_id: Number(id), quantity: n })), [qty]);
  const total = items.reduce((n, i) => n + i.quantity, 0);
  const paid = quote ? !quote.free : event.ticket_types.some((t) => qty[t.id] > 0 && !t.is_free);
  const money = useCallback((n) => formatMoney(n, quote?.currency?.symbol || event.currency?.symbol || '', { decimals: 'fixed' }), [quote, event.currency]);

  useEffect(() => {
    if (!items.length) { setQuote(null); return undefined; }
    let live = true;
    const t = setTimeout(() => { eventsPublicAPI.quote(event.slug, items).then((q) => { if (live) setQuote(q); }).catch(() => { if (live) setQuote(null); }); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [items, event.slug]);
  useEffect(() => () => { stop.current = true; }, []);

  const wait = useCallback(async (attempt) => {
    stop.current = false;
    for (let n = 0; n < GIVE_UP && !stop.current; n += 1) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (stop.current) return;
      try {
        const s = await checkoutAPI.paymentStatus(attempt.id, attempt.token, true);
        if (s.status === 'confirmed') {
          setPhase({ kind: 'done', title: 'Payment received. You are in!', tickets: s.event?.tickets ?? [], note: s.event?.problem ? 'We could not give you the seats: we will refund you.' : null });
          return;
        }
        if (s.status === 'failed') { setPhase({ kind: 'failed', reason: s.failure_reason || 'The payment did not go through.' }); return; }
      } catch { /* keep asking */ }
    }
    if (!stop.current) setPhase({ kind: 'failed', reason: 'We have not heard from M-Pesa yet. If you paid, your tickets will be confirmed shortly.', late: true });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!items.length) { toast.error('Choose how many tickets you want.'); return; }
    setBusy(true);
    try {
      const r = await eventsPublicAPI.buy(event.slug, { items, name: buyer.name, email: buyer.email, phone: buyer.phone || undefined, payment_method_id: paid ? methodId || undefined : undefined,
        holders: namesOn ? holders.slice(0, total) : undefined });
      if (r.status === 'issued') { setPhase({ kind: 'done', title: r.message, tickets: r.tickets }); return; }
      if (r.redirect_url) { window.location.assign(r.redirect_url); return; }
      setPhase({ kind: 'waiting', attempt: r.attempt, hold: r.hold_minutes, message: r.message });
      wait(r.attempt);
    } catch (err) { toast.error(errMsg(err, 'We could not get your tickets. Please try again.'), { duration: 8000 }); } finally { setBusy(false); }
  };

  if (phase?.kind === 'done') return <TicketsReady title={phase.title} tickets={phase.tickets} note={phase.note} />;
  if (phase?.kind === 'waiting') {
    return (
      <div role="status" aria-live="polite" style={{ ...card, display: 'grid', gap: 10, textAlign: 'center', justifyItems: 'center' }}>
        <Loader2 size={34} color="var(--color-primary-500)" style={{ animation: 'spin 1s linear infinite' }} />
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Waiting for your payment…</h2>
        <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)' }}>{phase.message}</p>
      </div>
    );
  }
  if (phase?.kind === 'failed') {
    return (
      <div role="alert" style={{ ...card, display: 'grid', gap: 10, textAlign: 'center', justifyItems: 'center' }}>
        <XCircle size={34} color="#b91c1c" />
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{phase.late ? 'Still waiting' : 'The payment did not go through'}</h2>
        <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)' }}>{phase.reason}</p>
        {!phase.late && <button type="button" style={{ ...primary, width: 'auto', padding: '10px 22px' }} onClick={() => setPhase(null)}>Try again</button>}
      </div>
    );
  }
  if (!event.can_buy) {
    return <div style={{ ...card, color: 'var(--text-secondary)' }}>{event.status === 'cancelled' ? 'This event has been cancelled.' : event.status === 'postponed' ? 'This event has been postponed. We will tell ticket holders the new date.' : event.over ? 'This event is over.' : 'Tickets are not on sale right now.'}</div>;
  }

  return (
    <form onSubmit={submit} style={{ ...card, display: 'grid', gap: 16 }} aria-label="Get tickets">
      <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Get tickets</h2>
      <TicketPicker event={event} qty={qty} onChange={setQty} />

      {total > 0 && (
        <>
          <div style={{ display: 'grid', gap: 10 }}>
            <div><label htmlFor="ev-name" style={label}>Your name</label><input id="ev-name" style={field} value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} required autoComplete="name" /></div>
            <div><label htmlFor="ev-email" style={label}>Email</label><input id="ev-email" type="email" style={field} value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} required autoComplete="email" /><span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Your tickets are sent here.</span></div>
            <div><label htmlFor="ev-phone" style={label}>Phone{paid ? '' : ' (optional)'}</label><input id="ev-phone" type="tel" style={field} value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} required={paid} autoComplete="tel" placeholder="0712 345 678" /></div>
          </div>

          {total > 1 && (
            <div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.84rem', cursor: 'pointer' }}><input type="checkbox" checked={namesOn} onChange={(e) => setNamesOn(e.target.checked)} /> Put a different name on each ticket</label>
              {namesOn && (
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  {Array.from({ length: total }, (_, i) => (
                    <input key={i} aria-label={`Name on ticket ${i + 1}`} placeholder={`Ticket ${i + 1}${i === 0 ? ` (${buyer.name || 'you'})` : ''}`} style={field} value={holders[i] ?? ''}
                      onChange={(e) => setHolders((h) => { const n = [...h]; n[i] = e.target.value; return n; })} />
                  ))}
                </div>
              )}
            </div>
          )}

          {paid && (
            <div>
              <span style={label}>Pay with</span>
              {event.payment_methods?.length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {event.payment_methods.map((m) => (
                    <label key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${Number(methodId) === m.id ? 'var(--color-primary-500)' : 'var(--line)'}`, cursor: 'pointer' }}>
                      <input type="radio" name="method" checked={Number(methodId) === m.id} onChange={() => setMethodId(m.id)} />
                      {m.gateway === 'mpesa_stk' ? <Smartphone size={16} aria-hidden="true" /> : <CreditCard size={16} aria-hidden="true" />}
                      <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{m.name}</span>
                    </label>
                  ))}
                </div>
              ) : <p style={{ margin: 0, fontSize: '0.84rem', color: '#b91c1c' }}>Online payment is not set up yet, so paid tickets can not be bought right now.</p>}
            </div>
          )}

          {quote && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'grid', gap: 4, fontSize: '0.88rem' }}>
              {quote.lines.map((l) => <div key={l.ticket_type_id} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{l.quantity} × {l.name}</span><span>{l.price > 0 ? money(l.amount) : 'Free'}</span></div>)}
              {!quote.free && quote.tax_total > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}><span>Tax</span><span>{money(quote.tax_total)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1.02rem' }}><span>Total</span><span>{quote.free ? 'Free' : money(quote.total)}</span></div>
            </div>
          )}
          <button type="submit" style={{ ...primary, opacity: busy || (paid && !event.payment_methods?.length) ? 0.6 : 1 }} disabled={busy || (paid && !event.payment_methods?.length)}>
            {busy ? 'One moment…' : quote?.free || !paid ? 'Get my tickets' : `Pay ${quote ? money(quote.total) : ''}`}
          </button>
          {paid && <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>Your seats are kept for a few minutes while you pay.</p>}
        </>
      )}
    </form>
  );
}
