import { useState } from 'react';
import { Btn, TextInput } from './ui';
import { check } from './uiTokens';

/**
 * Seven days, each open between two times or closed (build 2.2). `value` and what `onSave` gets are lists of { day (1 = Monday), opens, closes };
 * an empty list means any time. `prefix` keeps the field ids apart when two editors are on one page.
 */
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function HoursEditor({ value, onSave, onCancel, busy, prefix, saveLabel = 'Save the hours', children }) {
  const [days, setDays] = useState(() => Object.fromEntries((value || []).map((d) => [d.day, { opens: d.opens, closes: d.closes }])));
  const set = (day, patch) => setDays((old) => ({ ...old, [day]: { ...(old[day] || { opens: '08:00', closes: '17:00' }), ...patch } }));
  const toggle = (day) => setDays((old) => { const next = { ...old }; if (next[day]) delete next[day]; else next[day] = { opens: '08:00', closes: '17:00' }; return next; });
  const list = Object.entries(days).map(([day, h]) => ({ day: Number(day), ...h })).sort((a, b) => a.day - b.day);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(list); }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        {DAYS.map((name, i) => {
          const day = i + 1; const h = days[day];
          return (
            <div key={day} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) auto auto auto', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" style={check} checked={!!h} onChange={() => toggle(day)} aria-label={`Open on ${name}`} />{name}</label>
              {h ? (
                <>
                  <TextInput type="time" aria-label={`${name} opens`} id={`${prefix}-opens-${day}`} value={h.opens} onChange={(e) => set(day, { opens: e.target.value })} required style={{ width: 120 }} />
                  <span style={{ color: 'var(--text-secondary)' }}>to</span>
                  <TextInput type="time" aria-label={`${name} closes`} id={`${prefix}-closes-${day}`} value={h.closes} onChange={(e) => set(day, { closes: e.target.value })} required style={{ width: 120 }} />
                </>
              ) : <span style={{ gridColumn: '2 / -1', color: 'var(--text-secondary)' }}>{list.length ? 'Closed' : 'Any time'}</span>}
            </div>
          );
        })}
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>{list.length ? 'A day that is not ticked is closed.' : 'With no day ticked there are no hours: it can be opened at any time.'}</p>
      {children}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn type="submit" variant="primary" small busy={busy}>{saveLabel}</Btn>
        {list.length > 0 && <Btn small onClick={() => setDays({})}>Clear all days</Btn>}
        {onCancel && <Btn small onClick={onCancel}>Cancel</Btn>}
      </div>
    </form>
  );
}
