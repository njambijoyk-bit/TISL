import { useEffect, useState } from 'react';
import projectsAPI from '../../_shared/api/projects';
import { Chip, DataTable, Panel, PanelTitle } from './ui';
import { td, th } from './uiTokens';

const HEALTH = { good: ['good', 'On track'], warn: ['warning', 'Needs watching'], bad: ['problem', 'Off track'], none: ['neutral', 'Not measured yet'] };
const DOT = { good: 'var(--status-success)', warn: 'var(--status-warning)', bad: 'var(--status-error)' };
const UNIT = { pct: '%', count: '', days: ' days', hours: ' h' };
const fmt = (v, unit) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString('en-GB', { maximumFractionDigits: 1 })}${UNIT[unit] ?? ''}`);

function Dot({ status, label }) {
  return <span role="img" aria-label={label} title={label} style={{ display: 'inline-block', width: 9, height: 9, boxSizing: 'border-box', borderRadius: '50%', background: DOT[status] ?? 'transparent', border: DOT[status] ? 0 : '1.5px solid var(--text-secondary)' }} />;
}

/**
 * The scorecard on a piece of work (docs/PROJECTS_STAGE12_SPEC.md, build 12.2): each KPI now against its target, how it was worked out, and its
 * last eight weeks. The health is the worst KPI. A money figure shows only to those who see the work's money.
 */
export default function ScorecardPanel({ projectId }) {
  const [d, setD] = useState(null);
  useEffect(() => { projectsAPI.scorecard(projectId).then(setD).catch(() => setD(null)); }, [projectId]);
  if (!d?.ready || d.kpis.length === 0) return null;
  const h = HEALTH[d.health];

  return (
    <Panel data-scorecard style={{ gridColumn: '1 / -1' }}>
      <PanelTitle hint="Worked out from the work itself; money from Books. The health is the worst KPI." right={<Chip status={h[0]}>{h[1]}</Chip>}>Scorecard</PanelTitle>
      <DataTable minWidth={620}>
        <thead><tr><th style={th} /><th style={th}>KPI</th><th style={{ ...th, textAlign: 'right' }}>Now</th><th style={{ ...th, textAlign: 'right' }}>Green</th><th style={th}>Last 8 weeks</th></tr></thead>
        <tbody>
          {d.kpis.map((k) => (
            <tr key={k.id} data-scorecard-kpi={k.key}>
              <td style={td}><Dot status={k.status} label={HEALTH[k.status][1]} /></td>
              <td style={td}><strong>{k.name}</strong>{k.books && <> <Chip status="warning">from Books</Chip></>}{k.client_sees && <> <Chip>Client sees it</Chip></>}<span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>{k.detail}</span></td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(k.value, k.unit)}</td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{k.higher ? '≥' : '≤'} {fmt(k.target_good, k.unit)}</td>
              <td style={td}><span style={{ display: 'inline-flex', gap: 3 }} aria-label="Last eight weeks">{k.weeks.map((w, i) => <Dot key={i} status={w} label={`${d.weeks[i]}: ${w ? HEALTH[w][1] : 'not kept'}`} />)}</span></td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Panel>
  );
}
