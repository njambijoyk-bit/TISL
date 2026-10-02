import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import { myBookingsAPI } from '../../../_shared/api/bookings';
import { errMsg } from '../../../_shared/store/helpers/apiState';

/** A customer's own bookings, with cancel. Nothing about anyone else's bookings or about staff calendars is shown here. */

const LABEL = { confirmed: 'Booked', completed: 'Done', cancelled: 'Cancelled', no_show: 'Missed' };
const TONE = { confirmed: '#1d4ed8', completed: '#15803d', cancelled: '#6b7280', no_show: '#b45309' };

export default function MyBookings() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => myBookingsAPI.list().then((r) => setRows(r.rows)).catch((e) => setError(errMsg(e, 'Could not load your bookings'))), []);
  useEffect(() => { load(); }, [load]);
  const cancel = async (b) => {
    const warn = b.cancel_is_late ? 'This is close to the start time, so a cancellation fee may apply and your deposit may be kept. Cancel anyway?' : 'Cancel this booking?';
    if (!window.confirm(warn)) return;
    try { toast.success((await myBookingsAPI.cancel(b.id)).message); load(); } catch (e) { toast.error(errMsg(e, 'Could not cancel')); }
  };
  return (
    <>
      <Header />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px', minHeight: '60vh' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 16 }}>My bookings</h1>
        {error && <p role="alert" style={{ color: '#991b1b' }}>{error}</p>}
        {!rows && !error && <p>Loading…</p>}
        {rows && !rows.length && <p style={{ color: '#6b7280' }}>You have no bookings yet. Open a service and choose "Book a time".</p>}
        <div style={{ display: 'grid', gap: 10 }}>
          {rows?.map((b) => (
            <div key={b.id} style={{ border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 14, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong>{b.service}{b.package && b.package !== 'Standard' ? ` — ${b.package}` : ''}</strong>
                <span style={{ color: TONE[b.status], fontWeight: 700, fontSize: '0.8rem' }}>{LABEL[b.status]}</span>
              </div>
              <div style={{ fontSize: '0.84rem', color: '#374151', marginTop: 4 }}>{new Date(b.starts_at).toLocaleString([], { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}{b.with ? ` · with ${b.with}` : ''}</div>
              <div style={{ fontSize: '0.76rem', color: '#9ca3af' }}>{b.number}{b.deposit_amount > 0 ? ` · deposit ${b.deposit_amount.toFixed(2)}` : ''}</div>
              {b.can_cancel && <button type="button" onClick={() => cancel(b)} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>Cancel booking</button>}
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
