import { useState, useEffect, useCallback } from 'react';
import { Truck, MapPin, Phone, Loader2, PackageCheck } from 'lucide-react';
import CustomerLayout from '../../../_shared/components/layout/CustomerLayout';
import deliveryAPI from '../../../_shared/api/delivery';

const card = { background: 'var(--color-surface, #fff)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 15%, transparent)', borderRadius: 14, padding: 18, marginBottom: 14 };
const when = (s) => (s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null);

function Delivery({ d }) {
  const pct = d.total_stops ? Math.round((d.stops_done / d.total_stops) * 100) : 0;
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Truck size={18} color="var(--color-primary-500)" />
        <strong style={{ fontSize: '0.95rem' }}>{d.manifest_number}</strong>
        <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>{d.status === 'in_progress' ? 'On the road' : 'Dispatched — leaving soon'}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-primary-500)' }} />
      </div>
      <div style={{ fontSize: '0.74rem', color: '#6b7280', marginBottom: 12 }}>{d.stops_done} of {d.total_stops} stops done</div>
      {d.driver && (
        <div style={{ fontSize: '0.82rem', marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          Your driver: <strong>{d.driver.name}</strong>
          {d.driver.phone && <a href={`tel:${d.driver.phone}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: 'var(--color-primary-500)' }}><Phone size={13} /> {d.driver.phone}</a>}
        </div>
      )}
      {d.your_stops.map((s) => (
        <div key={s.stop_id} style={{ borderTop: '1px solid #f3f4f6', padding: '10px 0', fontSize: '0.82rem' }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {s.status === 'delivered' ? <><PackageCheck size={14} style={{ verticalAlign: -2 }} /> Delivered {when(s.delivered_at)}</>
              : s.status === 'out_for_delivery' || d.next_stop_is_yours ? 'You are next' : s.stops_ahead > 0 ? `${s.stops_ahead} stop${s.stops_ahead === 1 ? '' : 's'} before you` : 'Coming up'}
            {s.estimated_arrival && s.status !== 'delivered' && <span style={{ fontWeight: 400, color: '#6b7280' }}> · expected {when(s.estimated_arrival)}</span>}
          </div>
          <div style={{ color: '#6b7280', display: 'flex', gap: 5, alignItems: 'center' }}><MapPin size={12} /> {s.address ?? '—'}</div>
          <div style={{ color: '#9ca3af', fontSize: '0.74rem', marginTop: 2 }}>{s.delivery_notes.map((n) => n.number).join(', ')}</div>
        </div>
      ))}
    </div>
  );
}

/** Deliveries of theirs that are on a manifest on the road now. Refreshes itself every 30 seconds. */
export default function CustomerEnroute() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setRows((await deliveryAPI.getEnrouteDeliveries()).data ?? []); setErr(''); }
    catch (e) { setErr(e?.response?.data?.message ?? 'Could not load your deliveries.'); setRows((r) => r ?? []); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  return (
    <CustomerLayout>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 16px' }}>On the way to you</h1>
        {err && <p role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{err}</p>}
        {rows === null ? <Loader2 className="animate-spin" size={20} /> : rows.length === 0 ? (
          <div style={{ ...card, color: '#6b7280', fontSize: '0.88rem' }}>Nothing of yours is on the road right now. When a delivery leaves, it appears here.</div>
        ) : rows.map((d) => <Delivery key={d.manifest_id} d={d} />)}
      </div>
    </CustomerLayout>
  );
}
