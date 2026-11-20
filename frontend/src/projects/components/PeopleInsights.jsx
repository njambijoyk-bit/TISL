import { useEffect, useState } from 'react';
import projectsAPI from '../../_shared/api/projects';
import { Chip, DataTable, Panel, PanelTitle } from './ui';
import { td, th } from './uiTokens';

const HEALTH = { good: ['good', 'On track'], warn: ['warning', 'Needs watching'], bad: ['problem', 'Off track'], none: ['neutral', 'Not measured yet'] };
const UNIT = { pct: '%', count: '', days: ' days', hours: ' h' };
const CELL = { over: { background: 'color-mix(in srgb, var(--status-error) 14%, transparent)', color: 'var(--status-error)', fontWeight: 700 }, near: { background: 'color-mix(in srgb, var(--status-warning) 14%, transparent)', color: 'var(--status-warning)', fontWeight: 600 }, ok: {}, off: { color: 'var(--text-secondary)' } };
const n = (v) => Number(v).toLocaleString('en-GB', { maximumFractionDigits: 1 });

/** A person's scorecard (docs/PROJECTS_STAGE12_SPEC.md, build 12.3): theirs to see, and their managers'. */
export function PersonScorecard({ userId, title = 'Scorecard' }) {
  const [d, setD] = useState(null);
  useEffect(() => { projectsAPI.personScorecard(userId).then(setD).catch(() => setD(null)); }, [userId]);
  if (!d?.ready || d.kpis.length === 0) return null;
  return (
    <Panel data-person-scorecard>
      <PanelTitle hint="Worked out from time, tasks and timesheets" right={<Chip status={HEALTH[d.health][0]}>{HEALTH[d.health][1]}</Chip>}>{title}</PanelTitle>
      <div style={{ display: 'grid', gap: 8 }}>
        {d.kpis.map((k) => (
          <div key={k.id} data-person-kpi={k.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', fontSize: 13.5 }}>
            <span>{k.name}<span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>{k.detail}</span></span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontVariantNumeric: 'tabular-nums' }}><strong>{k.value === null ? '—' : `${n(k.value)}${UNIT[k.unit]}`}</strong><Chip status={HEALTH[k.status][0]}>{HEALTH[k.status][1]}</Chip></span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Capacity (build 12.3): eight weeks ahead, hours of open tasks due against working hours less leave. */
export function CapacityPanel() {
  const [d, setD] = useState(null);
  useEffect(() => { projectsAPI.capacity().then(setD).catch(() => setD(null)); }, []);
  if (!d?.people) return null;
  return (
    <Panel data-capacity>
      <PanelTitle hint="Hours of open tasks due each week (from their estimates) against working hours less leave. Red is over, amber within 10%.">Capacity, next eight weeks</PanelTitle>
      <DataTable minWidth={760}>
        <thead><tr><th style={th}>Person</th>{d.weeks.map((w) => <th key={w.from} style={{ ...th, textAlign: 'right' }}>Wk {w.number}</th>)}</tr></thead>
        <tbody>
          {d.people.map((p) => (
            <tr key={p.id} data-capacity-person={p.name}>
              <td style={td}><strong>{p.name}</strong>{p.no_estimate > 0 && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>{p.no_estimate} {p.no_estimate === 1 ? 'task has' : 'tasks have'} no estimate</span>}</td>
              {p.weeks.map((w, i) => <td key={i} data-week-state={w.state} style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ...CELL[w.state] }}>{w.state === 'off' ? 'off' : `${n(w.due_hours)} / ${n(w.can_hours)}`}</td>)}
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Panel>
  );
}
