import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { eventsBookingAPI } from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const box = { padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface-card, #fff)', display: 'grid', gap: 6 };
const input = { padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', font: 'inherit', background: 'transparent', color: 'inherit' };
const btn = { padding: '7px 14px', borderRadius: 999, border: 0, background: 'var(--color-primary-500)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.82rem' };
const ghost = { ...btn, background: 'transparent', color: 'inherit', border: '1px solid var(--line)' };
const LABEL = { enquiry: 'New enquiry', quoted: 'Quote sent', accepted: 'Accepted: waiting for the deposit', confirmed: 'Confirmed', delivered: 'Delivered: waiting for the planner', completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled' };
const money = (n) => Number(n || 0).toLocaleString();

/** For a vendor or venue: enquiries and bookings (quote, decline, mark delivered), the money TISL holds for them, and days they are not available. */
export default function ProviderBookings({ plural, id }) {
  const [res, setRes] = useState(null);
  const [q, setQ] = useState({});     // booking id -> {amount, deposit}
  const [day, setDay] = useState('');
  const [blocked, setBlocked] = useState([]);

  const load = useCallback(() => {
    eventsBookingAPI.providerList(plural, id).then(setRes).catch(() => setRes({ data: [], owed: 0 }));
    const from = new Date().toISOString().slice(0, 10); const to = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
    eventsBookingAPI.availability(plural, id, from, to).then((a) => setBlocked(a.blocked)).catch(() => {});
  }, [plural, id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, ok) => { try { await fn(); if (ok) toast.success(ok); load(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } };
  if (!res) return null;
  const set = (bid, k, v) => setQ((x) => ({ ...x, [bid]: { ...x[bid], [k]: v } }));

  return (
    <section style={{ ...box, gap: 12 }}>
      <strong>Bookings</strong>
      <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>TISL holds what planners pay you and pays you after each job is done, less its commission. Held for you now: <strong>{money(res.owed)}</strong>.</p>
      {res.data.length === 0 && <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-tertiary)' }}>No enquiries yet.</p>}
      {res.data.map((b) => (
        <div key={b.id} style={box}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><strong>{b.event}{b.offer ? ` · ${b.offer}` : ''}</strong><span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary-500)' }}>{LABEL[b.status]}</span></div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{b.reference} · {b.starts_on}{b.ends_on && b.ends_on !== b.starts_on ? ` to ${b.ends_on}` : ''}{b.guests ? ` · ${b.guests} guests` : ''}</span>
          {b.message && <span style={{ fontSize: '0.84rem' }}>“{b.message}”</span>}
          {b.quoted_amount != null && <span style={{ fontSize: '0.84rem' }}>Quote {money(b.quoted_amount)} · deposit {b.deposit_percent}% · paid {money(b.paid)} · TISL commission {b.commission_percent}%</span>}
          {['enquiry', 'quoted'].includes(b.status) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="number" min="1" placeholder="Price" value={q[b.id]?.amount ?? ''} onChange={(e) => set(b.id, 'amount', e.target.value)} aria-label="Price" style={{ ...input, width: 120 }} />
              <input type="number" min="0" max="100" placeholder="Deposit %" value={q[b.id]?.deposit ?? ''} onChange={(e) => set(b.id, 'deposit', e.target.value)} aria-label="Deposit percent" style={{ ...input, width: 110 }} />
              <button type="button" style={btn} disabled={!(Number(q[b.id]?.amount) > 0)} onClick={() => run(() => eventsBookingAPI.quote(b.id, { amount: Number(q[b.id].amount), deposit_percent: q[b.id].deposit === '' || q[b.id].deposit == null ? undefined : Number(q[b.id].deposit) }), 'Quote sent')}>{b.status === 'quoted' ? 'Change the quote' : 'Send a quote'}</button>
              <button type="button" style={ghost} onClick={() => run(() => eventsBookingAPI.decline(b.id), 'Declined')}>Decline</button>
            </div>
          )}
          {b.status === 'confirmed' && <div><button type="button" style={btn} onClick={() => run(() => eventsBookingAPI.deliver(b.id), 'Marked delivered')}>Mark as delivered</button></div>}
          {['accepted', 'confirmed'].includes(b.status) && <div><button type="button" style={ghost} onClick={() => run(() => eventsBookingAPI.cancel(b.id, 'Cancelled by the provider'), 'Cancelled')}>Cancel</button></div>}
        </div>
      ))}
      <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        <strong style={{ fontSize: '0.86rem' }}>Days you are not available</strong>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" min={new Date().toISOString().slice(0, 10)} value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day" style={input} />
          <button type="button" style={ghost} disabled={!day} onClick={() => run(async () => { await eventsBookingAPI.block(plural, id, [day], true); setDay(''); }, 'Blocked')}>Block this day</button>
        </div>
        {blocked.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{blocked.map((d) => <button key={d} type="button" style={{ ...ghost, padding: '3px 10px', fontSize: '0.76rem' }} onClick={() => run(() => eventsBookingAPI.block(plural, id, [d], false))} title="Free this day">{String(d).slice(0, 10)} ✕</button>)}</div>}
      </div>
    </section>
  );
}
