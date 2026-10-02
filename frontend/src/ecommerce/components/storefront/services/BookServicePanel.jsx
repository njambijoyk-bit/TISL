import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Calendar } from 'lucide-react';
import { myBookingsAPI } from '../../../../_shared/api/bookings';
import useAuthStore from '../../../../_shared/store/authStore';
import { errMsg } from '../../../../_shared/store/helpers/apiState';

/**
 * Book a service for a time. Shown only when the service can be booked online (someone is set up to do it). The customer sees free start times —
 * never who else is booked — then what they will be charged, and the cancellation rule, before confirming.
 */

const TIMING = { booking: 'now', completion: 'when done', late_cancel: 'if cancelled late', no_show: 'if you do not come', reschedule: 'if moved late' };
const box = { border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 14, background: '#fff' };

export default function BookServicePanel({ serviceId, variantId, money }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [info, setInfo] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState(null);
  const [time, setTime] = useState('');
  const [people, setPeople] = useState(1);
  const [onSite, setOnSite] = useState(false);
  const [address, setAddress] = useState('');
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { myBookingsAPI.availability(serviceId).then(setInfo).catch(() => setInfo({ bookable: false, booking_required: false, reason: 'error' })); }, [serviceId]);
  // the branches a package is offered at are where the people who do it work; one branch is chosen for the customer
  useEffect(() => {
    setBranch(''); setBranches([]);
    if (variantId && info?.bookable) myBookingsAPI.availability(serviceId, { service_variant_id: variantId }).then((r) => { setBranches(r.branches ?? []); if ((r.branches ?? []).length === 1) setBranch(String(r.branches[0].id)); }).catch(() => {});
  }, [serviceId, variantId, info?.bookable]);
  const needBranch = branches.length > 1 && !onSite && !branch;
  useEffect(() => {
    setSlots(null); setTime('');
    if (date && variantId && info?.bookable && !needBranch) myBookingsAPI.availability(serviceId, { date, service_variant_id: variantId, location_id: onSite ? undefined : branch || undefined }).then((r) => setSlots(r.slots ?? [])).catch(() => setSlots([]));
  }, [serviceId, variantId, date, info?.bookable, branch, needBranch, onSite]);
  const starts = date && time ? `${date} ${time}` : '';
  useEffect(() => {
    setQuote(null);
    if (user && starts && variantId) myBookingsAPI.quote({ service_id: serviceId, service_variant_id: variantId, starts_at: starts, people, on_site: onSite }).then(setQuote).catch(() => {});
  }, [user, starts, variantId, serviceId, people, onSite]);

  if (!info) return null;
  if (!info.bookable) {
    // a service that needs booking but has nobody set up yet says so, rather than showing nothing
    if (!info.booking_required) return null;
    return (
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 6 }}><Calendar size={16} /> Booking required</div>
        <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280' }}>This service is booked in advance. Online booking is not open yet — request a quote or contact us and we will find you a time.</p>
      </div>
    );
  }
  const go = async () => {
    if (!user) { navigate('/login', { state: { from: window.location.pathname } }); return; }
    setBusy(true);
    try { const r = await myBookingsAPI.create({ service_id: serviceId, service_variant_id: variantId, starts_at: starts, people, on_site: onSite, address: address || undefined, location_id: onSite ? undefined : branch || undefined }); toast.success(r.message); navigate('/my-bookings'); }
    catch (e) { toast.error(errMsg(e, 'Could not book')); } finally { setBusy(false); }
  };
  const fmt = (n) => (money ? money(n) : Number(n).toFixed(2));
  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 8 }}><Calendar size={16} /> Book a time</div>
      {!variantId && <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>Choose a package above first.</p>}
      {variantId && (
        <div style={{ display: 'grid', gap: 10 }}>
          {branches.length > 1 && !onSite && (
            <select value={branch} onChange={(e) => setBranch(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #d1d5db' }} aria-label="Branch">
              <option value="">Choose a branch…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {branches.length === 1 && !onSite && <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>At {branches[0].name}</p>}
          <label style={{ fontSize: '0.8rem' }}><input type="checkbox" checked={onSite} onChange={(e) => setOnSite(e.target.checked)} /> Come to my place</label>
          <input type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #d1d5db' }} />
          {date && slots !== null && (slots.length
            ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{slots.map((s) => <button key={s.time} type="button" onClick={() => setTime(s.time)} style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${time === s.time ? 'var(--color-primary-500)' : '#e5e7eb'}`, background: time === s.time ? 'rgba(59,130,246,0.08)' : '#fff', fontWeight: time === s.time ? 700 : 500 }}>{s.time}</button>)}</div>
            : <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>Nothing free that day — try another.</p>)}
          {time && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '0.8rem' }}>People <input type="number" min="1" value={people} onChange={(e) => setPeople(Number(e.target.value) || 1)} style={{ width: 64, padding: 6, borderRadius: 6, border: '1px solid #d1d5db' }} /></label>
              </div>
              {onSite && <input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #d1d5db' }} />}
              {quote && (
                <div style={{ background: '#f9fafb', borderRadius: 8, padding: 10, fontSize: '0.8rem' }}>
                  <div>Price <strong>{fmt(quote.price)}</strong> <span style={{ color: '#9ca3af' }}>(tax is added)</span></div>
                  {quote.fees.filter((f) => !['late_cancel', 'no_show', 'reschedule'].includes(f.timing)).map((f) => <div key={f.ledger_id} style={{ color: '#6b7280' }}>{f.name}: {fmt(f.amount)} — {TIMING[f.timing]}</div>)}
                  {quote.due_at_booking > 0 && <div style={{ marginTop: 4 }}>To pay now: <strong>{fmt(quote.due_at_booking)}</strong></div>}
                  <div style={{ marginTop: 4, color: '#9ca3af' }}>Cancel more than {info.window_hours} hours ahead and nothing is charged; later, a fee may apply and the deposit is kept.</div>
                </div>
              )}
              <button type="button" disabled={busy} onClick={go} style={{ height: 46, borderRadius: 12, border: 'none', cursor: 'pointer', color: '#fff', fontWeight: 700, background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}>{user ? (busy ? 'Booking…' : 'Confirm booking') : 'Log in to book'}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
