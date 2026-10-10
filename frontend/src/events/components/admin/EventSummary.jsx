import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import eventsAPI from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { formatMoney } from '../../../_shared/lib/money';
import SimpleTable from '../../../core/components/admin/ui/SimpleTable';
import { card, colors } from '../../../_shared/theme/tokens';
import { whenText } from '../../lib/eventFormat';

const Tile = ({ label, value, sub, to }) => {
  const body = (
    <div style={{ ...card, padding: 14, display: 'grid', gap: 2, height: '100%' }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.textFaint }}>{label}</span>
      <span style={{ fontSize: '1.6rem', fontWeight: 900, lineHeight: 1.1 }}>{value}</span>
      {sub && <span style={{ fontSize: '0.74rem', color: colors.textMuted }}>{sub}</span>}
    </div>
  );

  return to ? <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>{body}</Link> : body;
};

/** A thin bar with its number beside it: how full something is. The number is always written, so the bar never carries meaning alone. */
const Meter = ({ value, max, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 130 }}>
    <span role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max || 0} style={{ flex: 1, height: 6, borderRadius: 999, background: colors.tint(0.12), overflow: 'hidden', minWidth: 60 }}>
      <span style={{ display: 'block', width: `${max ? Math.min(100, (value / max) * 100) : 0}%`, height: '100%', background: colors.primary }} />
    </span>
    <span style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{value}{max ? ` / ${max}` : ''}</span>
  </span>
);

/** An event's Summary: what has sold and what it brought in (before tax), who has arrived on each date, and what has gone back. */
export default function EventSummary({ eventId }) {
  const [s, setS] = useState(null);
  useEffect(() => { eventsAPI.summary(eventId).then(setS).catch((e) => toast.error(errMsg(e, 'Could not load the summary'))); }, [eventId]);
  if (!s) return <p style={{ color: colors.textMuted, fontSize: '0.82rem' }}>Loading…</p>;
  const money = (n) => formatMoney(n, s.currency?.symbol || s.currency?.code || '', { decimals: 'auto' });
  const top = Math.max(1, ...s.by_day.map((d) => d.tickets));

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Tile label="Tickets sold" value={s.tickets.valid} sub={`${s.tickets.paid} paid · ${s.tickets.free} free${s.tickets.held ? ` · ${s.tickets.held} being bought` : ''}`} />
        <Tile label="Brought in" value={money(s.money.sold)} sub="Before tax" />
        <Tile label="Arrived" value={s.tickets.checked_in} sub={`of ${s.tickets.valid} ticket${s.tickets.valid === 1 ? '' : 's'}`} />
        <Tile label="Refunded" value={s.tickets.refunded} sub={s.money.refunded ? money(s.money.refunded) : 'Nothing yet'} />
        {s.money.refunds_waiting > 0 && <Tile label="Refunds waiting" value={s.money.refunds_waiting} sub="Decide them" to="/admin/events?tab=refunds" />}
      </div>

      <section>
        <h2 style={{ margin: '0 0 8px', fontSize: '0.95rem', fontWeight: 800 }}>By ticket</h2>
        <SimpleTable rowKey="id" rows={s.by_type} empty="No tickets yet." columns={[
          { key: 'name', label: 'Ticket', render: (r) => <span style={{ fontWeight: 700 }}>{r.name}{!r.is_active && <span style={{ color: colors.textFaint, fontWeight: 500 }}> · off sale</span>}</span> },
          { key: 'price', label: 'Price', align: 'right', render: (r) => (r.price ? money(r.price) : 'Free') },
          { key: 'sold', label: 'Sold', render: (r) => <Meter value={r.sold} max={r.capacity} label={`${r.name} sold`} /> },
          { key: 'remaining', label: 'Left', align: 'right', render: (r) => (r.remaining === null ? 'No limit' : r.remaining) },
          { key: 'revenue', label: 'Brought in', align: 'right', render: (r) => money(r.revenue) },
        ]} />
      </section>

      <section>
        <h2 style={{ margin: '0 0 8px', fontSize: '0.95rem', fontWeight: 800 }}>By date</h2>
        <SimpleTable rowKey="id" rows={s.by_session} empty="No dates yet." columns={[
          { key: 'starts_at', label: 'Date', render: (r) => <span>{whenText(r.starts_at)}{r.label ? ` · ${r.label}` : ''}</span> },
          { key: 'expected', label: 'Tickets', align: 'right' },
          { key: 'arrived', label: 'Arrived', render: (r) => <Meter value={r.arrived} max={r.expected} label={`Arrived on ${whenText(r.starts_at)}`} /> },
          { key: 'percent', label: '', align: 'right', render: (r) => (r.expected ? `${r.percent}%` : '—') },
        ]} />
      </section>

      {s.by_day.length > 0 && (
        <section>
          <h2 style={{ margin: '0 0 8px', fontSize: '0.95rem', fontWeight: 800 }}>Sales by day (last 30 days)</h2>
          <SimpleTable rowKey="date" rows={s.by_day} columns={[
            { key: 'date', label: 'Day', render: (r) => whenText(`${r.date}T00:00`, { time: false }) },
            { key: 'tickets', label: 'Tickets', render: (r) => <Meter value={r.tickets} max={top} label={`Tickets sold on ${r.date}`} /> },
            { key: 'revenue', label: 'Brought in', align: 'right', render: (r) => money(r.revenue) },
          ]} />
        </section>
      )}
    </div>
  );
}
