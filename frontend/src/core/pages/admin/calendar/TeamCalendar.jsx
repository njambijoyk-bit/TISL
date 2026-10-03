import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../components/admin/ui/HubHeader';
import calendarAPI from '../../../../_shared/api/calendar';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { card, colors, input } from '../../../../_shared/theme/tokens';

/** Managers only: what each person has on over the next two weeks. Open a name for their full calendar. */

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function TeamCalendar() {
  const [start, setStart] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const days = Array.from({ length: 14 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));

  useEffect(() => {
    setError(null);
    calendarAPI.team({ from: ymd(days[0]), to: ymd(days[13]) }).then(setData).catch((e) => setError(errMsg(e, 'Could not load the team calendar')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  const shift = (n) => setStart((s) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + n));
  const count = (p, d) => p.entries.filter((e) => { const s = new Date(e.starts_at); const en = e.ends_at ? new Date(e.ends_at) : s; return ymd(s) <= ymd(d) && ymd(en) >= ymd(d); });

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HubHeader title="Team calendar" description="Who has what on, over two weeks. Open a name for their calendar." />
        {error && <p role="alert" style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: '0.82rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, margin: '8px 0 12px' }}>
          <button type="button" style={{ ...input, width: 'auto', cursor: 'pointer' }} onClick={() => shift(-14)}>‹ Earlier</button>
          <button type="button" style={{ ...input, width: 'auto', cursor: 'pointer' }} onClick={() => shift(14)}>Later ›</button>
          <Link to="/admin/calendar" style={{ marginLeft: 'auto', fontSize: '0.8rem', alignSelf: 'center' }}>← My calendar</Link>
        </div>
        {!data && !error && <p style={{ color: colors.textMuted }}>Loading…</p>}
        {data && (
          <section style={{ ...card, padding: 8, overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.76rem' }}>
              <thead><tr><th style={{ textAlign: 'left', padding: 6 }}>Person</th>{days.map((d) => <th key={ymd(d)} style={{ padding: 6, color: colors.textFaint, fontWeight: 600 }}>{d.toLocaleDateString(undefined, { weekday: 'short' })}<br />{d.getDate()}</th>)}</tr></thead>
              <tbody>
                {data.people.map((p) => (
                  <tr key={p.user.id}>
                    <td style={{ padding: 6, borderTop: '1px solid var(--line)', whiteSpace: 'nowrap' }}><Link to={`/admin/calendar?user_id=${p.user.id}`}>{p.user.name}</Link></td>
                    {days.map((d) => { const n = count(p, d); return <td key={ymd(d)} title={n.map((e) => e.title).join('\n')} style={{ padding: 6, borderTop: '1px solid var(--line)', textAlign: 'center', background: n.length ? 'color-mix(in srgb, var(--color-primary-500) 14%, var(--surface-card, #fff))' : 'var(--surface-card, #fff)', color: n.length ? '#1d4ed8' : 'var(--text-tertiary)' }}>{n.length || '·'}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </AdminLayout>
  );
}
