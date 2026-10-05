import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import activityFeedAPI from '../../../../_shared/api/activityFeed';
import { errMsg } from '../../../../_shared/store/helpers/apiState';

const field = { padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--surface-input, var(--surface-card))', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.8rem' };
const when = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? iso : `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

/** Every log on the site in one newest-first timeline. Filter by area, date or words; a person only ever sees the areas their role allows. */
export default function ActivityFeed({ sources, onSources }) {
  const [group, setGroup] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [qLive, setQLive] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { const t = setTimeout(() => setQLive(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [group, from, to, qLive]);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await activityFeedAPI.list({ page, per_page: 50, source: group ? [group] : undefined, from: from || undefined, to: to || undefined, q: qLive || undefined });
      setRows(r.data); setMore(r.has_more); onSources?.(r.sources);
    } catch (e) { setError(errMsg(e, 'Could not load the activity')); }
    finally { setLoading(false); }
  }, [page, group, from, to, qLive, onSources]);
  useEffect(() => { load(); }, [load]);

  const groups = [...new Set((sources ?? []).map((s) => s.group))];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-tertiary)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search who, what or where…" style={{ ...field, width: '100%', boxSizing: 'border-box', paddingLeft: 30 }} />
        </div>
        <select value={group} onChange={(e) => setGroup(e.target.value)} style={field} aria-label="Area">
          <option value="">All areas</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={field} aria-label="From" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={field} aria-label="To" />
      </div>
      {error && <p role="alert" style={{ margin: 0, color: 'var(--color-danger, #dc2626)', fontSize: '0.82rem' }}>{error}</p>}
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['When', 'Area', 'Who', 'What', 'To', 'Detail'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '9px 12px', fontSize: '0.76rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{when(r.at)}</td>
                <td style={{ padding: '9px 12px', fontSize: '0.76rem' }}><span style={{ padding: '2px 8px', borderRadius: 999, background: 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)', color: 'var(--color-primary-500)', fontWeight: 700, whiteSpace: 'nowrap' }}>{r.label}</span></td>
                <td style={{ padding: '9px 12px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{r.actor}</td>
                <td style={{ padding: '9px 12px', fontSize: '0.8rem', color: 'var(--text-primary)' }}>{r.action}</td>
                <td style={{ padding: '9px 12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{r.subject}</td>
                <td style={{ padding: '9px 12px', fontSize: '0.76rem', color: 'var(--text-tertiary)', maxWidth: 360 }}>{r.summary}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={6} style={{ padding: 22, textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>{sources && sources.length === 0 ? 'Your role does not have any activity logs to show.' : 'Nothing matches.'}</td></tr>}
            {loading && <tr><td colSpan={6} style={{ padding: 22, textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Loading…</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>Page {page}</span>
        <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} style={{ ...field, cursor: 'pointer' }}>‹ Newer</button>
        <button type="button" disabled={!more || loading} onClick={() => setPage((p) => p + 1)} style={{ ...field, cursor: 'pointer' }}>Older ›</button>
      </div>
    </div>
  );
}
