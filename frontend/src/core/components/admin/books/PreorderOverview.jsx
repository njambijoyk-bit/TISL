import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import preordersAPI from '../../../../_shared/api/preorders';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import SimpleTable from '../ui/SimpleTable';
import { card, colors } from '../../../../_shared/theme/tokens';
import { money } from './booksFmt';

const qty = (n) => (Math.round(Number(n) * 100) / 100).toLocaleString();
const pct = (n) => `${Math.round(Number(n) * 1000) / 10}%`;
const STATUS = { open: 'Open', full: 'Full', stopped: 'Stopped', closed: 'Closed', scheduled: 'Scheduled', ended: 'Ended' };

/** A figure with its name and one line of context. No colour on the number: a flag is spelled out in words beside it. */
function Tile({ label, value, note, flag }) {
  return (
    <div style={{ ...card, padding: '14px 16px', display: 'grid', gap: 4, alignContent: 'start' }}>
      <span style={{ fontSize: '0.72rem', color: colors.textMuted }}>{label}</span>
      <strong style={{ fontSize: '1.5rem', fontWeight: 700, color: colors.text, lineHeight: 1.1 }}>{value}</strong>
      {note && <span style={{ fontSize: '0.72rem', color: colors.textFaint }}>{note}</span>}
      {flag && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: colors.text }}>⚠ {flag}</span>}
    </div>
  );
}

/**
 * Preorders taken per day over the last 30 days: one series, so no legend (the title says what it is). Thin columns with a rounded top on a single baseline,
 * hairline guides, the busiest day labelled, a tooltip on hover and keyboard focus, and the same numbers as a table underneath.
 */
function PerDayChart({ days }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...days.map((d) => d.orders));
  const top = Math.max(1, Math.ceil(max / 2) * 2);
  const peak = days.reduce((a, d, i) => (d.orders > (days[a]?.orders ?? -1) ? i : a), 0);
  const total = days.reduce((t, d) => t + d.orders, 0);
  const H = 130;

  return (
    <section aria-label="Preorders taken per day" style={{ ...card, padding: 16, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Preorders taken per day</h2>
        <span style={{ fontSize: '0.74rem', color: colors.textMuted }}>Last {days.length} days · {total} preorder{total === 1 ? '' : 's'}</span>
      </div>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '28px 1fr', gap: 6 }}>
        <div aria-hidden style={{ position: 'relative', height: H, fontSize: '0.66rem', color: colors.textFaint }}>
          {[top, top / 2, 0].map((t) => <span key={t} style={{ position: 'absolute', right: 0, bottom: `${(t / top) * 100}%`, transform: 'translateY(50%)' }}>{qty(t)}</span>)}
        </div>
        <div style={{ position: 'relative', height: H }} onPointerLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((f) => <div key={f} aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: `${f * 100}%`, borderTop: `1px solid ${colors.tint(f === 0 ? 0.25 : 0.08)}` }} />)}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
            {days.map((d, i) => (
              <div key={d.date} role="img" tabIndex={0} aria-label={`${d.date}: ${d.orders} preorder${d.orders === 1 ? '' : 's'}, ${qty(d.units)} units`}
                onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', position: 'relative', outline: 'none' }}>
                <div style={{ width: '100%', maxWidth: 24, height: `${(d.orders / top) * 100}%`, minHeight: d.orders > 0 ? 2 : 0, background: colors.primary, opacity: hover === null || hover === i ? 1 : 0.55,
                  borderRadius: '4px 4px 0 0', transition: 'opacity 120ms' }} />
                {i === peak && d.orders > 0 && <span aria-hidden style={{ position: 'absolute', bottom: `calc(${(d.orders / top) * 100}% + 3px)`, fontSize: '0.66rem', fontWeight: 700, color: colors.text }}>{d.orders}</span>}
              </div>
            ))}
          </div>
          {hover !== null && (
            <div role="status" style={{ position: 'absolute', top: 0, left: `${((hover + 0.5) / days.length) * 100}%`, transform: `translate(${hover > days.length / 2 ? '-105%' : '5%'}, 0)`, padding: '6px 10px', borderRadius: 8,
              background: 'var(--surface-card, #fff)', border: `1px solid ${colors.tint(0.2)}`, boxShadow: '0 4px 14px rgba(0,0,0,0.12)', fontSize: '0.74rem', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 2 }}>
              <strong style={{ display: 'block', fontSize: '0.9rem' }}>{days[hover].orders} preorder{days[hover].orders === 1 ? '' : 's'}</strong>
              <span style={{ color: colors.textMuted }}>{days[hover].date} · {qty(days[hover].units)} units</span>
            </div>
          )}
        </div>
      </div>
      <div aria-hidden style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 34, fontSize: '0.66rem', color: colors.textFaint }}><span>{days[0]?.date}</span><span>{days[days.length - 1]?.date}</span></div>
      <details>
        <summary style={{ cursor: 'pointer', fontSize: '0.74rem', color: colors.textMuted }}>Show as a table</summary>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', marginTop: 8 }}>
          <thead><tr><th style={{ textAlign: 'left', padding: 4 }}>Day</th><th style={{ textAlign: 'right', padding: 4 }}>Preorders</th><th style={{ textAlign: 'right', padding: 4 }}>Units</th></tr></thead>
          <tbody>{days.filter((d) => d.orders > 0).map((d) => <tr key={d.date}><td style={{ padding: 4 }}>{d.date}</td><td style={{ textAlign: 'right', padding: 4 }}>{d.orders}</td><td style={{ textAlign: 'right', padding: 4 }}>{qty(d.units)}</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}

/** How full an offer is: the filled part of a track, with the numbers beside it (so it never relies on colour alone). */
function Fill({ taken, limit }) {
  if (!limit) return <span style={{ color: colors.textMuted }}>{qty(taken)} taken, no limit</span>;
  const f = Math.min(1, taken / limit);
  return (
    <span style={{ display: 'grid', gap: 3, minWidth: 130 }}>
      <span style={{ height: 6, borderRadius: 99, background: colors.tint(0.12), overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${f * 100}%`, background: colors.primary, borderRadius: 99 }} /></span>
      <span style={{ fontSize: '0.72rem', color: colors.textMuted }}>{qty(taken)} of {qty(limit)} ({pct(f)})</span>
    </span>
  );
}

/** Orders → Preorder overview. See docs/PREORDER_PLAN.md. */
export default function PreorderOverview() {
  const [d, setD] = useState(null);
  useEffect(() => { preordersAPI.dashboard().then(setD).catch((e) => toast.error(errMsg(e, 'Could not load the overview'))); }, []);
  const offers = useMemo(() => d?.offers ?? [], [d]);

  if (!d) return <p style={{ color: colors.textMuted }}>Loading…</p>;
  if (!d.ready) return <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Preorders are not set up yet. Run database script 103_preorders.sql, then reload.</p>;
  const h = d.headline;

  const columns = [
    { key: 'item', label: 'Offer', render: (o) => <span><strong>{o.item}</strong>{o.option && <span style={{ color: colors.textMuted }}> · {o.option}</span>}<div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{o.campaign}</div></span> },
    { key: 'status', label: 'State', render: (o) => STATUS[o.status] ?? o.status },
    { key: 'fill', label: 'Places taken', render: (o) => <Fill taken={o.taken} limit={o.limit_total} /> },
    { key: 'owed', label: 'Owed', align: 'right', render: (o) => qty(o.owed) },
    { key: 'stock', label: 'In stock', align: 'right', render: (o) => qty(o.stock) },
    { key: 'incoming', label: 'On order', align: 'right', render: (o) => qty(o.incoming) },
    { key: 'short', label: 'Covered?', render: (o) => (o.owed <= 0 ? '—' : o.short > 0 ? <strong>Short by {qty(o.short)}</strong> : 'Covered') },
    { key: 'expected', label: 'Customers are told', render: (o) => (o.expected ? `${o.expected}${o.from_supply ? ' (from the purchase order)' : ''}` : '—') },
  ];

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
        <Tile label="Offers open now" value={h.open_offers} />
        <Tile label="Units owed to customers" value={qty(h.units_owed)} note={`${qty(h.units_taken)} taken in all`} flag={h.units_short > 0 ? `${qty(h.units_short)} not covered by stock or orders` : null} />
        <Tile label="Paid, not yet delivered" value={money(h.paid_not_delivered.value)} note={`${h.paid_not_delivered.lines} line${h.paid_not_delivered.lines === 1 ? '' : 's'}, before tax`} />
        <Tile label="Orders past their date" value={h.late_orders} note={h.late_orders ? `oldest ${h.oldest_late_days} day${h.oldest_late_days === 1 ? '' : 's'} late` : 'none late'} />
        <Tile label="Cancellations waiting" value={h.cancel_requests} note={h.cancel_requests ? 'Open "Preorders waiting" to decide' : 'nothing waiting'} />
        <Tile label="Average time to deliver" value={h.avg_days_to_deliver === null ? '—' : `${h.avg_days_to_deliver} days`} note={`first delivery, last ${d.window_days} days`} />
        <Tile label="Cancelled by customers" value={h.cancel_rate === null ? '—' : pct(h.cancel_rate)} note={`of preorders, last ${d.window_days} days`} />
      </div>

      <PerDayChart days={d.per_day} />

      <section aria-label="Offers" style={{ display: 'grid', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Offers</h2>
        <SimpleTable columns={columns} rows={offers} empty="No preorder offers yet. Make one on a campaign." />
      </section>

      {d.late.length > 0 && (
        <section aria-label="Past their date" style={{ display: 'grid', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Past their date (oldest first)</h2>
          <SimpleTable rowKey="order_id" rows={d.late} columns={[
            { key: 'number', label: 'Order', render: (r) => <Link to={`/admin/orders/${r.order_id}`}>{r.number}</Link> },
            { key: 'promised', label: 'Promised', render: (r) => r.promised },
            { key: 'days', label: 'Late by', align: 'right', render: (r) => `${r.days} day${r.days === 1 ? '' : 's'}` },
            { key: 'owed', label: 'Still owed', align: 'right', render: (r) => qty(r.owed) },
          ]} />
        </section>
      )}
    </div>
  );
}
