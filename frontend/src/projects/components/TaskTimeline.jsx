import { day } from '../lib/format';

const DAY = 86400000;
const toDay = (d) => Date.UTC(...String(d).slice(0, 10).split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));

/**
 * The timeline (build 5.2): a bar per task from its start to its due date (a task with only one of them is a single day), on one scale from the
 * earliest to the latest date, with marks (Mondays over a short range, months over a long one) and today. Read only: dragging bars comes with Stage 12. Tasks with neither date are listed below.
 */
export default function TaskTimeline({ data, onOpen }) {
  const dated = data.tasks.filter((t) => (t.start_date || t.due_date) && t.matches !== false);
  const undated = data.tasks.filter((t) => !t.start_date && !t.due_date && t.matches !== false);
  if (!dated.length) return <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }} data-timeline>No task has a start or due date yet, so there is nothing to draw.</p>;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const spans = dated.map((t) => { const a = toDay(t.start_date || t.due_date); const b = toDay(t.due_date || t.start_date); return { t, a: Math.min(a, b), b: Math.max(a, b) }; });
  const from = Math.min(today, ...spans.map((s) => s.a)) - 2 * DAY;
  const to = Math.max(today, ...spans.map((s) => s.b)) + 3 * DAY;
  const pct = (x) => `${((x - from) / (to - from)) * 100}%`;
  // marks: the first of each month over a long range; each Monday over a range of under ten weeks
  const label = (x, o) => new Date(x).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
  const months = [];
  if (to - from < 70 * DAY) {
    for (let x = from + ((8 - new Date(from).getUTCDay()) % 7) * DAY; x < to - DAY; x += 7 * DAY) months.push({ at: x, label: label(x, { day: 'numeric', month: 'short' }) });
  } else {
    for (let d = new Date(from); d.getTime() <= to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      if (first >= from && first < to - 5 * DAY) months.push({ at: first, label: label(first, { month: 'short', year: '2-digit' }) });
    }
  }
  const mix = (token) => [`color-mix(in srgb, var(${token}) 16%, var(--surface-card))`, `var(${token})`];
  const tone = (t) => (t.status === 'done' ? mix('--status-success') : t.overdue ? mix('--status-error') : mix('--color-primary-500'));

  return (
    <div style={{ overflowX: 'auto' }} data-timeline>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '6px 12px', alignItems: 'center', minWidth: 760, fontSize: 12.5 }}>
        <span />
        <div style={{ position: 'relative', height: 16 }}>{months.map((m) => <span key={m.at} style={{ position: 'absolute', left: pct(m.at), color: 'var(--text-secondary)', fontWeight: 700, fontSize: 11 }}>{m.label}</span>)}</div>
        {spans.map(({ t, a, b }) => {
          const [bg, edge] = tone(t);
          return [
            <button key={`n${t.id}`} type="button" onClick={() => onOpen(t.id)} style={{ background: 'none', border: 0, padding: 0, paddingLeft: t.depth * 14, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>T{t.number} {t.title}</button>,
            <div key={`b${t.id}`} style={{ position: 'relative', height: 18, borderLeft: '1px solid var(--line)' }} data-bar={t.ref}>
              {months.map((m) => <i key={m.at} style={{ position: 'absolute', left: pct(m.at), top: 0, bottom: 0, width: 1, background: 'var(--line)' }} />)}
              <i style={{ position: 'absolute', left: pct(today), top: -3, bottom: -3, width: 2, background: 'var(--status-error)' }} title="Today" />
              <span title={`${day(t.start_date || t.due_date)} to ${day(t.due_date || t.start_date)}`} style={{ position: 'absolute', left: pct(a), width: `max(6px, calc(${pct(b + DAY)} - ${pct(a)}))`, top: 2, height: 14, borderRadius: 4, background: bg, border: `1px solid ${edge}` }} />
            </div>,
          ];
        })}
      </div>
      {undated.length > 0 && <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>Without dates: {undated.map((t) => `T${t.number} ${t.title}`).join(', ')}.</p>}
    </div>
  );
}
