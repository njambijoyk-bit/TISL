import { Minus, Plus } from 'lucide-react';
import { formatMoney } from '../../../_shared/lib/money';
import { whenText } from '../../lib/eventFormat';

const btn = { width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--surface-card, #fff)', color: 'inherit', display: 'grid', placeItems: 'center', cursor: 'pointer' };

const stateNote = (t) => {
  if (t.state === 'sold_out') return 'Sold out';
  if (t.state === 'not_yet') return `On sale from ${whenText(t.on_sale_from)}`;
  if (t.state === 'ended') return 'Sale has ended';
  if (t.state === 'off') return 'Not on sale';

  return t.left !== null ? `Only ${t.left} left` : '';
};

/** The ticket types with a plus and minus each. A type that asks for at least 2 jumps from 0 to 2. */
export default function TicketPicker({ event, qty, onChange }) {
  const money = (n) => formatMoney(n, event.currency?.symbol || event.currency?.code || '', { decimals: 'auto' });
  const several = event.sessions.filter((s) => !s.is_cancelled).length > 1;
  const dayName = (id) => { const s = event.sessions.find((x) => x.id === id); return s ? (s.label || whenText(s.starts_at, { time: false })) : ''; };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {event.ticket_types.map((t) => {
        const n = qty[t.id] || 0;
        const can = t.state === 'on_sale' && t.max > 0;
        const set = (v) => onChange({ ...qty, [t.id]: v });
        const note = stateNote(t);

        return (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: 14, borderRadius: 12, border: `1.5px solid ${n ? 'var(--color-primary-500)' : 'var(--line)'}`, background: 'var(--surface-card, #fff)', opacity: can ? 1 : 0.7 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800 }}>{t.name}</div>
              <div style={{ fontWeight: 700, color: 'var(--color-primary-500)', fontSize: '0.92rem' }}>{t.is_free ? 'Free' : <>{money(t.price)}{event.tax_added ? <span style={{ fontWeight: 500, color: 'var(--text-tertiary)', fontSize: '0.74rem' }}> + tax</span> : null}</>}</div>
              {t.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>{t.description}</div>}
              {several && t.session_ids.length > 0 && <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: 2 }}>Gets in on: {t.session_ids.map(dayName).join(', ')}</div>}
              {note && <div style={{ fontSize: '0.76rem', fontWeight: 700, color: t.state === 'on_sale' ? '#b45309' : 'var(--text-tertiary)', marginTop: 2 }}>{note}</div>}
              {t.min > 1 && can && <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>Sold in groups of at least {t.min}</div>}
            </div>
            {can && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button type="button" style={{ ...btn, opacity: n ? 1 : 0.4 }} disabled={!n} aria-label={`Fewer ${t.name} tickets`} onClick={() => set(n <= t.min ? 0 : n - 1)}><Minus size={14} /></button>
                <span aria-live="polite" style={{ minWidth: 22, textAlign: 'center', fontWeight: 800 }}>{n}</span>
                <button type="button" style={{ ...btn, opacity: n >= t.max ? 0.4 : 1 }} disabled={n >= t.max} aria-label={`More ${t.name} tickets`} onClick={() => set(n === 0 ? Math.min(t.min, t.max) : n + 1)}><Plus size={14} /></button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
